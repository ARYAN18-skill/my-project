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

// --------------------- Cloudinary Config (NO SIGNATURE) ---------------------
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

// --------------------- FUNCTION: Fetch Image from Web via SerpAPI ----------
async function fetchImageFromWeb(query) {
  try {
    const serpURL =
      "https://serpapi.com/search.json?engine=google_images&q=" +
      encodeURIComponent(query) +
      "&api_key=" +
      process.env.SERP_API_KEY;

    const serpRes = await axios.get(serpURL);

    if (
      !serpRes.data.images_results ||
      serpRes.data.images_results.length === 0
    ) {
      console.log("No results found on SerpAPI");
      return null;
    }

    const imageUrl = serpRes.data.images_results[0].original;
    console.log("Fetched image URL from SerpAPI:", imageUrl);

    // Download image locally
    const imgBytes = await axios({
      url: imageUrl,
      responseType: "arraybuffer",
    });

    const tempPath = "temp.jpg";
    fs.writeFileSync(tempPath, imgBytes.data);

    // Upload to Cloudinary (unsigned, no signature required)
    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "auto_images",
    });

    fs.unlinkSync(tempPath);

    return {
      publicId: uploadResult.public_id,
      imageUrl: uploadResult.secure_url,
    };
  } catch (err) {
    console.log("SerpAPI ERROR:", err.response?.data || err.message);
    return null;
  }
}

// --------------------- SEARCH ROUTE ---------------------
app.get("/search", async (req, res) => {
  try {
    const title = req.query.title.trim().toLowerCase();

    // Check cache
    let imageDoc = await Image.findOne({ title });

    if (!imageDoc) {
      console.log("Not in DB → Fetching from SerpAPI");

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

    // Send stored Cloudinary URL
    return res.json({ url: imageDoc.imageUrl });
  } catch (err) {
    console.error("Search Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --------------------- DOWNLOAD IMAGE FROM CLOUDINARY ---------------------
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
app.listen(PORT, () => console.log("Server running on port", PORT));
