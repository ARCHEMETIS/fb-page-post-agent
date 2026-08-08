import { Resvg, initWasm } from "@resvg/resvg-wasm";
import satori from "satori";

import interFont from "./assets/inter-latin-400-normal.woff";
import resvgWasm from "./assets/resvg.wasm";

export interface CardInput {
  title: string;
  subtitle?: string;
  sourceUrl?: string;
}

let wasmReady: Promise<void> | undefined;
function ensureWasmInit(): Promise<void> {
  if (!wasmReady) {
    wasmReady = initWasm(resvgWasm);
  }
  return wasmReady;
}

export async function renderCard({ title, subtitle, sourceUrl }: CardInput): Promise<Uint8Array<ArrayBuffer>> {
  await ensureWasmInit();
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
            : { type: "div", props: { children: "" } },
        ],
      },
    },
    {
      width: 1080,
      height: 1080,
      fonts: [{ name: "Inter", data: interFont, weight: 400, style: "normal" }],
    },
  );

  // asPng() is typed with the default ArrayBufferLike buffer, but resvg-wasm always returns
  // ArrayBuffer-backed bytes — never SharedArrayBuffer — so narrowing here is safe and avoids
  // copying ~170KB just to satisfy the type.
  return new Resvg(svg).render().asPng() as Uint8Array<ArrayBuffer>;
}
