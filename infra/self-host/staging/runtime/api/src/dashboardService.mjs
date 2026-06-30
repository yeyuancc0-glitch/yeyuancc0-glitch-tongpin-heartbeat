function dateKey(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function publicProfile(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    displayName: row.display_name,
    avatarStoragePath: row.avatar_storage_path,
    avatarThumbnailStoragePath: row.avatar_thumbnail_storage_path,
    birthday: dateKey(row.birthday),
    accountStatus: row.account_status,
    deletionRequestedAt: row.deletion_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicCouple(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    relationshipStartedAt: dateKey(row.relationship_started_at),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    status: row.status,
  };
}

function publicMember(row) {
  return {
    id: `${row.couple_id}:${row.user_id}`,
    coupleId: row.couple_id,
    userId: row.user_id,
    role: row.role ?? "member",
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    profile: publicProfile({
      id: row.profile_id ?? row.user_id,
      display_name: row.display_name,
      avatar_storage_path: row.avatar_storage_path,
      avatar_thumbnail_storage_path: row.avatar_thumbnail_storage_path,
      birthday: row.birthday,
      account_status: row.account_status,
      deletion_requested_at: row.deletion_requested_at,
      created_at: row.profile_created_at ?? row.joined_at,
      updated_at: row.profile_updated_at ?? row.joined_at,
    }),
  };
}

const dashboardListLimit = 1000;
const dashboardInitialMediaImageLimit = 12;
const dashboardImageHydrationTimeoutMs = 900;

async function resolveWithin(promise, timeoutMs, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function withProfileImageUrls(profile, imageUrls) {
  if (!profile) {
    return profile;
  }
  const urls = imageUrls?.avatarsByUserId?.[profile.id];
  return {
    ...profile,
    avatarThumbSignedUrl: urls?.avatarThumbSignedUrl ?? null,
    avatarThumbDataUrl: urls?.avatarThumbDataUrl ?? null,
    avatarSignedUrl: null,
  };
}

function withCoupleImageUrls(couple, imageUrls) {
  if (!couple) {
    return couple;
  }
  return {
    ...couple,
    members: couple.members.map((member) => ({
      ...member,
      profile: withProfileImageUrls(member.profile, imageUrls),
    })),
  };
}

function withMediaImageUrls(media, imageUrls) {
  return media.map((mediaFile) => {
    const urls = imageUrls?.mediaById?.[mediaFile.id];
    return {
      ...mediaFile,
      thumbnailSignedUrl: urls?.thumbnailSignedUrl ?? null,
      signedUrl: null,
    };
  });
}

export function createDashboardService({
  calendarService,
  checkinService,
  creationService,
  footprintService,
  letterService,
  messageService,
  notificationService,
  pool,
  profileService,
  relationshipService,
  storageService,
}) {
  async function activeCoupleWithMembers(current) {
    const result = await pool.query(
      `
        select
          c.id as couple_id,
          c.relationship_started_at,
          c.created_by_user_id,
          c.created_at as couple_created_at,
          c.ended_at,
          c.status as couple_status,
          cm.user_id,
          cm.role,
          cm.joined_at,
          cm.left_at,
          p.id as profile_id,
          p.display_name,
          p.avatar_storage_path,
          p.avatar_thumbnail_storage_path,
          p.birthday,
          p.account_status,
          p.deletion_requested_at,
          p.created_at as profile_created_at,
          p.updated_at as profile_updated_at
        from public.couples c
        join public.couple_members current_member on current_member.couple_id = c.id
        join public.couple_members cm on cm.couple_id = c.id and cm.status = 'active'
        left join public.profiles p on p.id = cm.user_id
        where current_member.user_id = $1
          and current_member.status = 'active'
          and c.status = 'active'
        order by cm.joined_at asc
      `,
      [current.user.id],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const first = result.rows[0];
    return {
      ...publicCouple({
        id: first.couple_id,
        relationship_started_at: first.relationship_started_at,
        created_by_user_id: first.created_by_user_id,
        created_at: first.couple_created_at,
        ended_at: first.ended_at,
        status: first.couple_status,
      }),
      members: result.rows.map(publicMember),
    };
  }

  async function getDashboard(current) {
    const profile = profileService
      ? await profileService.ensureProfile(current)
      : publicProfile((await pool.query("select * from public.profiles where id = $1", [current.user.id])).rows[0]);
    const couple = await activeCoupleWithMembers(current);
    if (!couple) {
      const pendingInvites = relationshipService ? await relationshipService.listPendingInvites(current) : { invites: [] };
      const imageUrls = storageService.createDashboardImageUrls
        ? await resolveWithin(
            Promise.resolve(storageService.createDashboardImageUrls({ profiles: [profile], media: [] }, current)).catch(() => null),
            dashboardImageHydrationTimeoutMs,
            null,
          )
        : null;
      return {
        profile: withProfileImageUrls(profile, imageUrls),
        couple: null,
        pendingInvites: pendingInvites.invites,
        checkins: [],
        messages: [],
        events: [],
        letters: [],
        media: [],
        moodStatuses: [],
        notifications: [],
        creationSpace: null,
        creationActions: [],
        petMemories: [],
        footprints: [],
      };
    }

    const coupleId = couple.id;
    const [
      checkins,
      messages,
      events,
      letters,
      media,
      moodStatuses,
      notifications,
      creationSpace,
      creationActions,
      petMemories,
      footprints,
    ] = await Promise.all([
      checkinService.listCheckins({ coupleId, limit: dashboardListLimit }, current),
      messageService.listMessages({ coupleId, limit: dashboardListLimit }, current),
      calendarService.listEvents({ coupleId, limit: dashboardListLimit }, current),
      letterService.listLetters({ coupleId, limit: dashboardListLimit }, current),
      storageService.listMedia({ coupleId, limit: dashboardListLimit }, current),
      checkinService.listMoodStatuses({ coupleId }, current),
      notificationService.listNotifications({ coupleId, limit: dashboardListLimit }, current),
      creationService.ensureCreationSpace({ coupleId }, current),
      creationService.listCreationActions({ coupleId, limit: dashboardListLimit }, current),
      creationService.listPetMemories({ coupleId, limit: dashboardListLimit }, current),
      footprintService.listFootprints({ coupleId, limit: dashboardListLimit }, current),
    ]);

    const profilesForSigning = [
      profile,
      ...couple.members.map((member) => member.profile),
    ].filter(Boolean);
    const initialMediaForSigning = media.media.slice(0, dashboardInitialMediaImageLimit);
    const imageUrls = storageService.createDashboardImageUrls
      ? await resolveWithin(
          Promise.resolve(
            storageService.createDashboardImageUrls(
              {
                profiles: profilesForSigning,
                media: initialMediaForSigning,
              },
              current,
            ),
          ).catch(() => null),
          dashboardImageHydrationTimeoutMs,
          null,
        )
      : null;

    return {
      profile: withProfileImageUrls(profile, imageUrls),
      couple: withCoupleImageUrls(couple, imageUrls),
      pendingInvites: [],
      checkins: checkins.checkins,
      messages: messages.messages,
      events: events.events,
      letters: letters.letters,
      media: withMediaImageUrls(media.media, imageUrls),
      moodStatuses: moodStatuses.moodStatuses,
      notifications: notifications.notifications,
      creationSpace: creationSpace.creationSpace,
      creationActions: creationActions.creationActions,
      petMemories: petMemories.petMemories,
      footprints: footprints.footprints,
    };
  }

  return {
    getDashboard,
  };
}
