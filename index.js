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

// --------------------- Auto Fetch Logic -----------------------
async function fetchImageFromWeb(query) {
  try {
    const searchUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}`;

    const response = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.data.results || response.data.results.length === 0) {
      return null;
    }

    let imageUrl = response.data.results[0].image;

    // Download the image temporarily
    const imgData = await axios({
      url: imageUrl,
      responseType: "arraybuffer",
    });

    const tempPath = "temp_download.jpg";
    fs.writeFileSync(tempPath, imgData.data);

    // Upload to Cloudinary as PRIVATE
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
    console.log("Web Fetch Error:", err);
    return null;
  }
}

// --------------------- Smart Search Route ---------------------
app.get("/search", async (req, res) => {
  try {
    const title = req.query.title.trim().toLowerCase();

    // STEP 1: Try to find in MongoDB
    let imageDoc = await Image.findOne({ title });

    // STEP 2: If not found, auto-fetch from the web
    if (!imageDoc) {
      console.log("Not in DB, fetching from web...");

      const fetched = await fetchImageFromWeb(title);

      if (!fetched) {
        return res.json({ error: "Image not found on the internet" });
      }

      imageDoc = await Image.create({
        title,
        publicId: fetched.publicId,
        imageUrl: fetched.imageUrl,
      });
    }

    // STEP 3: Generate secure signed Cloudinary URL
    const signedUrl = cloudinary.url(imageDoc.publicId, {
      secure: true,
      sign_url: true,
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5 minutes expiry
    });

    return res.json({ url: signedUrl });

  } catch (err) {
    console.error("Search Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------- FALLBACK ------------------------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------- START SERVER --------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
