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

// --------------------- FREE IMAGE FETCH USING BING (NO API REQUIRED) ---------------------
async function fetchImageFromWeb(query) {
  try {
    const searchUrl =
      "https://www.bing.com/images/search?q=" + encodeURIComponent(query);

    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const html = response.data;

    const match = html.match(/"murl":"(.*?)"/);
    if (!match) {
      console.log("No Bing Image Found");
      return null;
    }

    const imageUrl = match[1];
    console.log("Bing Image URL:", imageUrl);

    const imgResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*;q=0.9,*/*;q=0.8",
      },
    });

    const buffer = Buffer.from(imgResponse.data);
    const type = await FileType.fromBuffer(buffer);

    if (!type || !type.mime.startsWith("image/")) {
      console.log("INVALID IMAGE from Bing");
      return null;
    }

    const tempPath = "temp." + type.ext;
    fs.writeFileSync(tempPath, buffer);

    const uploadResult = await cloudinary.uploader.upload(tempPath, {
      folder: "auto_images",
      resource_type: "image",
    });

    fs.unlinkSync(tempPath);

    return {
      publicId: uploadResult.public_id,
      imageUrl: uploadResult.secure_url,
    };
  } catch (err) {
    console.log("Image Fetch Error:", err.message);
    return null;
  }
}

// --------------------- SEARCH ROUTE ---------------------
app.get("/search", async (req, res) => {
  try {
    const title = req.query.title.trim().toLowerCase();

    let imageDoc = await Image.findOne({ title });

    if (!imageDoc) {
      console.log("Not in DB → Fetching from Bing…");

      const fetched = await fetchImageFromWeb(title);

      if (!fetched) {
        return res.json({ error: "No image found online." });
      }

      imageDoc = await Image.create({
        title,
        publicId: fetched.publicId,
        imageUrl: fetched.imageUrl,
      });
    }

    return res.json({ url: imageDoc.imageUrl });
  } catch (err) {
    console.error("Search Error:", err);
    return res.status(500).json({ error: "Server Error" });
  }
});

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
