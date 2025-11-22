require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { v2: cloudinary } = require("cloudinary");

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend files
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
  filename: String,
  imageUrl: String,
  publicId: String, // NOTE: your DB uses publicId (camelCase)
  sizeKB: Number,
  uploadedAt: { type: Date, default: Date.now },
});

const Image = mongoose.model("Image", imageSchema);

// --------------------- Multer Setup --------------------------
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// --------------------- Helpers -------------------------------
function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {}
}

// --------------------- Image Compression ---------------------
async function compressImage(input, output) {
  await sharp(input)
    .resize(1200) // reduce big images
    .jpeg({ quality: 80 })
    .toFile(output);
}

// --------------------- UPLOAD ROUTE --------------------------
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const inputPath = req.file.path;
    const compressedPath = "compressed-" + req.file.filename;

    // Compress image
    await compressImage(inputPath, compressedPath);

    // Upload to Cloudinary (private)
    const uploadResult = await cloudinary.uploader.upload(compressedPath, {
      folder: "images",
      type: "private",
      resource_type: "image",
    });

    const sizeKB = Math.round(req.file.size / 1024);

    // Save metadata to MongoDB
    const saved = await Image.create({
      filename: req.file.originalname,
      imageUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      sizeKB,
    });

    // Clean temp files
    removeFile(inputPath);
    removeFile(compressedPath);

    res.json({
      success: true,
      id: saved._id,
      imageUrl: saved.imageUrl,
      sizeKB: saved.sizeKB,
    });

  } catch (err) {
    console.log("Upload Error:", err);
    res.json({ success: false, message: "Upload failed" });
  }
});

// --------------------- SIGNED URL SEARCH ROUTE ----------------
app.get("/search", async (req, res) => {
  try {
    const title = req.query.title;

    const imageDoc = await Image.findOne({ filename: title });

    if (!imageDoc) {
      return res.json({ error: "Image not found" });
    }

    // Generate secure signed URL (expires in 5 minutes)
    const signedUrl = cloudinary.url(imageDoc.publicId, {
      secure: true,
      sign_url: true,
      type: "private",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });

    return res.json({ url: signedUrl });

  } catch (err) {
    console.error("Search Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// --------------------- LIST IMAGES ---------------------------
app.get("/images", async (req, res) => {
  const list = await Image.find().sort({ uploadedAt: -1 });
  res.json(list);
});

// --------------------- VIEW IMAGE ----------------------------
app.get("/view/:id", async (req, res) => {
  try {
    const img = await Image.findById(req.params.id);
    if (!img) return res.status(404).send("Image not found");

    // redirect to secure URL
    res.redirect(img.imageUrl);

  } catch {
    res.status(500).send("Error");
  }
});

// --------------------- DOWNLOAD IMAGE ------------------------
app.get("/download/:id", async (req, res) => {
  try {
    const img = await Image.findById(req.params.id);
    if (!img) return res.status(404).send("Image not found");

    const response = await axios.get(img.imageUrl, { responseType: "stream" });

    res.setHeader("Content-Disposition",
      `attachment; filename="${img.filename}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");

    response.data.pipe(res);

  } catch (err) {
    console.log("Download Error:", err);
    res.status(500).send("Download failed");
  }
});

// --------------------- DELETE IMAGE --------------------------
app.delete("/delete-image/:id", async (req, res) => {
  try {
    const img = await Image.findById(req.params.id);

    if (!img) {
      return res.json({ success: false, message: "Image not found in DB" });
    }

    // DELETE FROM CLOUDINARY
    if (img.publicId) {
      const cloudRes = await cloudinary.uploader.destroy(img.publicId);

      if (cloudRes.result !== "ok" && cloudRes.result !== "not found") {
        console.log("Cloudinary delete error:", cloudRes);
        return res.json({ success: false, message: "Cloudinary delete failed" });
      }
    }dir 

    await Image.findByIdAndDelete(req.params.id);

    res.json({ success: true });

  } catch (err) {
    console.log("Delete Error:", err);
    res.json({ success: false });
  }
});

// --------------------- FALLBACK FOR FRONTEND -----------------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------- START SERVER --------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
