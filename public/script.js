// Upload Image
document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = document.getElementById("imageInput").files[0];
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/upload-image", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (data.success) {
    const img = document.getElementById("uploadedImage");
    img.src = data.imageUrl;
    img.style.display = "block";

    loadGallery(); // refresh gallery
  }
});

// Load gallery
async function loadGallery() {
  const res = await fetch("/images");
  const images = await res.json();

  const gallery = document.getElementById("gallery");
  gallery.innerHTML = ""; // reset

  images.forEach(img => {
    const imageTag = document.createElement("img");
    imageTag.src = img.imageUrl;
    gallery.appendChild(imageTag);
  });
}

loadGallery();
