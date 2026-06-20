const intervalMs = 60_000;

console.log("tongpin staging worker placeholder started");

setInterval(() => {
  console.log(
    JSON.stringify({
      service: "tongpin-staging-worker",
      status: "alive",
      time: new Date().toISOString(),
    }),
  );
}, intervalMs);
