import { readFile } from "node:fs/promises";
import { render } from "takumi-js";
import { Renderer } from "takumi-js/node";

// The link preview image, served as /og.png by the Vite plugin in vite.config.ts
function Card() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "72px 80px",
        background: "#0a0a0a",
        color: "#fafafa",
        fontFamily: "Inter",
        fontFeatureSettings: '"calt" 1, "ss07" 1, "cv11" 1, "cv06" 1',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: 13,
            background: "#ebebeb",
            color: "#171717",
            fontSize: 22,
          }}
        >
          r<span style={{ color: "#f97c3d" }}>.</span>
        </div>
        redoost
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 64,
          fontSize: 92,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.05em",
        }}
      >
        <span>Drop a folder.</span>
        <span style={{ color: "#a1a1a1" }}>Get an address.</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginTop: 56,
          padding: "22px 28px",
          border: "1.5px solid #ffffff1a",
          borderRadius: 18,
          background: "#171717",
          fontFamily: "Geist Mono",
          fontSize: 28,
          color: "#a1a1a1",
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#f97c3d",
            boxShadow: "0 0 0 6px #f97c3d33",
          }}
        />
        <span>
          https://
          <span style={{ color: "#fafafa", fontWeight: 500 }}>
            brave-otter-1a2b
          </span>
          .whyredfire.dpdns.org
        </span>
      </div>
    </div>
  );
}

export async function renderOgImage() {
  const renderer = new Renderer();
  await renderer.registerFont({
    name: "Inter",
    data: await readFile("public/fonts/InterVariable.woff2"),
  });
  await renderer.registerFont({
    name: "Geist Mono",
    data: await readFile("public/fonts/GeistMonoVariable.woff2"),
  });
  return render(<Card />, { renderer, width: 1200, height: 630 });
}
