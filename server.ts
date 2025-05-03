import { serve } from "https://deno.land/std/http/server.ts";
import { ffmpeg } from "https://deno.land/x/dffmpeg/mod.ts";
import * as path from "https://deno.land/std/path/mod.ts";

const uploadsDir = "/tmp/uploads";
const outputsDir = "/tmp/outputs";

await Deno.mkdir(uploadsDir, { recursive: true }).catch(() => {});
await Deno.mkdir(outputsDir, { recursive: true }).catch(() => {});

function generateRandomId() {
  return Math.random().toString(36).substring(2, 10); 
}

async function handleConvertRequest(req: Request): Promise<Response> {
  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fileId = generateRandomId(); 
    const mp4Path = path.join(uploadsDir, `${fileId}.mp4`);
    const mp3Path = path.join(outputsDir, `${fileId}.mp3`);

    // Download the video file
    const downloadStartTime = Date.now();
    const res = await fetch(url);
    const fileStream = await Deno.create(mp4Path);
    await res.body?.pipeTo(fileStream.writable);
    const downloadTime = (Date.now() - downloadStartTime) / 1000;

    // Convert to MP3 using FFmpeg
    const conversionStartTime = Date.now();
    await ffmpeg()
      .input(mp4Path)
      .output(mp3Path)
      .audioCodec("libmp3lame")
      .audioBitrate("192")
      .overwrite()
      .run();
    const conversionTime = (Date.now() - conversionStartTime) / 1000;

    // File info
    const mp4Size = (await Deno.stat(mp4Path)).size;
    const mp3Size = (await Deno.stat(mp3Path)).size;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conversion successful",
        mp3File: `/download/${fileId}.mp3`,
        timing: {
          downloadTime: `${downloadTime.toFixed(2)} seconds`,
          conversionTime: `${conversionTime.toFixed(2)} seconds`,
        },
        fileInfo: {
          originalSize: `${(mp4Size / (1024 * 1024)).toFixed(2)} MB`,
          convertedSize: `${(mp3Size / (1024 * 1024)).toFixed(2)} MB`,
          compressionRatio: `${((1 - mp3Size / mp4Size) * 100).toFixed(2)}%`,
        },
        fileId: fileId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Conversion failed", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

async function handleDownloadRequest(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const filename = pathname.split("/").pop();
  const filePath = path.join(outputsDir, filename!);

  try {
    const file = await Deno.open(filePath);
    const headers = new Headers();
    headers.set("Content-Type", "audio/mpeg");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    return new Response(file.readable, {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "File not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/convert" && req.method === "POST") {
    return handleConvertRequest(req);
  } else if (url.pathname.startsWith("/download/")) {
    return handleDownloadRequest(req);
  } else {
    return new Response("Not Found", { status: 404 });
  }
}

const port = 8000;
console.log(`Server running on http://localhost:${port}`);
await serve(handler, { port });