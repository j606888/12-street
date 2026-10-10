"use client";

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="zh-TW">
      <body>
        <main
          style={{
            maxWidth: "28rem",
            margin: "0 auto",
            padding: "4rem 1rem",
            textAlign: "center",
            fontFamily: "sans-serif",
          }}
        >
          <h1>發生了一點問題</h1>
          <p>系統暫時無法載入，請稍後再試。</p>
          <button type="button" onClick={() => retry()}>
            重試
          </button>
        </main>
      </body>
    </html>
  );
}
