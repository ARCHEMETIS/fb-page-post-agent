import { readFile } from "node:fs/promises";

import { Resvg, initWasm } from "@resvg/resvg-wasm";
import satori from "satori";

export interface CardInput {
  title: string;
  subtitle?: string;
  sourceUrl?: string;
}

// Netlify's function bundler flattens this module into netlify/functions/{name}.mjs,
// so at runtime import.meta.url points at the function's own directory, not _shared/ —
// hence the "_shared/" prefix here even though this file itself lives in _shared/.
const interFont = readFile(new URL("./_shared/inter-latin-400-normal.woff", import.meta.url)).then(
  (font) => font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
);

// resvg-js's native binding only ships a build for the platform it was `npm install`-ed on
// (Windows here), which breaks at runtime on Netlify's Linux functions. The WASM build has
// no platform-specific binary, so it works identically in local dev and when deployed.
let wasmReady: Promise<void> | undefined;
function ensureWasmInit(): Promise<void> {
  if (!wasmReady) {
    wasmReady = readFile(new URL("./_shared/resvg.wasm", import.meta.url)).then((wasm) => initWasm(wasm));
  }
  return wasmReady;
}

export async function renderCard({ title, subtitle, sourceUrl }: CardInput): Promise<Buffer> {
  const [fontData] = await Promise.all([interFont, ensureWasmInit()]);
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "88px",
          color: "#f8fafc",
          backgroundColor: "#0f172a",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, rgba(56, 189, 248, 0.28), transparent 34%), linear-gradient(145deg, #0f172a, #172554)",
          fontFamily: "Inter",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "32px",
                maxWidth: "900px",
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      width: "116px",
                      height: "10px",
                      borderRadius: "999px",
                      backgroundColor: "#38bdf8",
                    },
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: "76px",
                      lineHeight: 1.08,
                      letterSpacing: "-2px",
                      fontWeight: 400,
                      overflowWrap: "break-word",
                    },
                    children: title,
                  },
                },
                subtitle
                  ? {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "34px",
                          lineHeight: 1.35,
                          color: "#cbd5e1",
                          overflowWrap: "break-word",
                        },
                        children: subtitle,
                      },
                    }
                  : null,
              ],
            },
          },
          sourceUrl
            ? {
                type: "div",
                props: {
                  style: {
                    fontSize: "21px",
                    color: "#94a3b8",
                    overflowWrap: "break-word",
                  },
                  children: sourceUrl,
                },
              }
            : {
                type: "div",
                props: { children: "" },
              },
        ],
      },
    },
    {
      width: 1080,
      height: 1080,
      fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" }],
    },
  );

  return Buffer.from(new Resvg(svg).render().asPng());
}
