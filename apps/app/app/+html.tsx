import { type PropsWithChildren } from "react";

const viewportContent = "width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover";
const baseStyle = `
html,body,#root{
  min-height:100%;
  background:#fbf7f4;
  -webkit-text-size-adjust:100%;
  text-size-adjust:100%;
  scrollbar-width:none;
  -ms-overflow-style:none;
}
html,body{
  touch-action:pan-x pan-y;
  overscroll-behavior-x:none;
  overscroll-behavior-y:auto;
}
body{
  margin:0;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar,
#root::-webkit-scrollbar,
#root *::-webkit-scrollbar{
  width:0;
  height:0;
  display:none;
}
textarea[placeholder*="把今天想说的话写在这里"] {
  line-height: 30px !important;
}
`;
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content={viewportContent} />
        <meta name="theme-color" content="#fbf7f4" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="同频跳动" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <title>同频跳动</title>
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <style dangerouslySetInnerHTML={{ __html: baseStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
