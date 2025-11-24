require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
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

// --------------------- MongoDB Config -------------------------
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
    const serpURL =
      `https://serpapi.com/search.json?engine=google_images&q=` +
      encodeURIComponent(query) +
      `&api_key=` +
      process.env.SERP_API_KEY;

    const serpRes = await axios.get(serpURL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }
    });

    if (!serpRes.data.images_results || serpRes.data.images_results.length === 0) {
      console.log("No results found on SerpAPI");
      return null;
    }

    const imageUrl = serpRes.data.images_results[0].original;

    const imgBytes = await axios({
      url: imageUrl,
      responseType: "arraybuffer",
    });

    const tempPath = "temp_image.jpg";
    fs.writeFileSync(tempPath, imgBytes.data);

    const upload = await cloudinary.uploader.upload(tempPath, {
      folder: "auto_images",
      type: "private",
      resource_type: "image",
    });

    fs.unlinkSync(tempPath);

    return {
      publicId: upload.public_id,
      imageUrl: upload.secure_url,
    };
  } catch (err) {
    console.log("SerpAPI Error:", err.response?.data || err.message);
    return null;
  }
}


// --------------------- Smart Search Route ---------------------
app.get("/search", async (req, res) => {
  try {
    const title = req.query.title.trim().toLowerCase();

    let imageDoc = await Image.findOne({ title });

    if (!imageDoc) {
      console.log("Not found in DB. Fetching from SerpAPI…");

      const fetched = await fetchImageFromWeb(title);

      if (!fetched) {
        return res.json({ error: "No image found on the internet." });
      }

      imageDoc = await Image.create({
        title,
        publicId: fetched.publicId,
        imageUrl: fetched.imageUrl,
      });
    }

    const signedUrl = cloudinary.url(imageDoc.publicId, {
      secure: true,
      sign_url: true,
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });

    res.json({ url: signedUrl });
  } catch (err) {
    console.error("Search Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------- Download Route -------------------------
app.get("/download/:title", async (req, res) => {
  try {
    const title = req.params.title.trim().toLowerCase();

    const imageDoc = await Image.findOne({ title });
    if (!imageDoc) {
      return res.status(404).send("Image not found in DB");
    }

    const signedUrl = cloudinary.url(imageDoc.publicId, {
      secure: true,
      sign_url: true,
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });

    const response = await axios({
      url: signedUrl,
      responseType: "stream",
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${imageDoc.title}.jpg"`
    );
    res.setHeader("Content-Type", "image/jpeg");

    response.data.pipe(res);
  } catch (err) {
    console.error("Download Error:", err);
    res.status(500).send("Download failed");
  }
});

// --------------------- Fallback to Frontend ------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------- Start Server ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
