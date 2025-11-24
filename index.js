require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FileType = require("file-type");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// --------------------- Cloudinary Config ---------------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// --------------------- MongoDB ---------------------
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

const imageSchema = new mongoose.Schema({
  title: String,
  publicId: String,
  imageUrl: String,
  uploadedAt: { type: Date, default: Date.now },
});

const Image = mongoose.model("Image", imageSchema);

async function fetchImageFromWeb(query) {
  try {
    const apiUrl =
      "https://duckduckgo.com/?q=" + encodeURIComponent(query) + "&iax=images&ia=images";

    // Step 1 — Get DuckDuckGo Token
    const tokenResponse = await axios.get(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const vqdMatch = tokenResponse.data.match(/vqd='(.*?)'/);
    if (!vqdMatch) {
      console.log("DuckDuckGo vqd token not found");
      return null;
    }

    const vqd = vqdMatch[1];

    // Step 2 — Fetch Images JSON
    const jsonUrl =
      "https://duckduckgo.com/i.js?l=us-en&o=json&q=" +
      encodeURIComponent(query) +
      "&vqd=" +
      vqd;

    const jsonResponse = await axios.get(jsonUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!jsonResponse.data.results || jsonResponse.data.results.length === 0) {
      console.log("DuckDuckGo returned no images");
      return null;
    }

    const imageUrl = jsonResponse.data.results[0].image;
    console.log("DuckDuckGo Image URL:", imageUrl);

    // Step 3 — Download the image
    const imgResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const buffer = Buffer.from(imgResponse.data);
    const type = await FileType.fromBuffer(buffer);

    if (!type || !type.mime.startsWith("image/")) {
      console.log("Invalid image downloaded");
      return null;
    }

    const tempPath = "temp." + type.ext;
    fs.writeFileSync(tempPath, buffer);

    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "auto_images",
    });

    fs.unlinkSync(tempPath);

    return {
      publicId: uploadResult.public_id,
      imageUrl: uploadResult.secure_url,
    };
  } catch (err) {
    console.log("DuckDuckGo Fetch Error:", err.message);
    return null;
  }
}



// --------------------- DOWNLOAD IMAGE ---------------------
app.get("/download/:title", async (req, res) => {
  try {
    const title = req.params.title.trim().toLowerCase();

    const doc = await Image.findOne({ title });
    if (!doc) return res.status(404).send("Not found");

    const response = await axios({
      url: doc.imageUrl,
      responseType: "stream",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title}.jpg"`
    );
    res.setHeader("Content-Type", "image/jpeg");

    response.data.pipe(res);
  } catch (err) {
    console.log("Download Error:", err);
    res.status(500).send("Download failed");
  }
});

// --------------------- FRONTEND FALLBACK ---------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------- START SERVER ---------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);
