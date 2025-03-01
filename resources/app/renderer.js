let videoElement;
let currentFilter = 'none';
let moodChart;
let modelIsLoaded = false;
let faceDetectionNet, faceExpressionNet;
let moodData = [];
let filteredCanvas, filteredCtx;
let photoshootActive = false;
let photoshootCount = 0;
const photoshootImages = [];
let countdownInterval;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
if (typeof faceapi !== 'undefined' && faceapi.env) {
    faceapi.env.monkeyPatch({
        createCanvasElement: () => document.createElement('canvas')
    });
}
console.log("Is browser environment:", isBrowser());
setTimeout(() => {
    console.log(faceapi.nets);
  }, 10);
async function loadModels() {
    try{
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('./models/ssd_mobilenetv1'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models/face_expression')
          ]);
        console.log('Models loaded successfully');
        modelIsLoaded = true;
        moodDetectionEnabled = true;    
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

async function initializeWebcam() {
    videoElement = document.getElementById('webcamVideo');
    filteredCanvas = document.getElementById('filteredCanvas');
    filteredCtx = filteredCanvas.getContext('2d');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        await new Promise(resolve => videoElement.onloadedmetadata = resolve);
        
        filteredCanvas.width = videoElement.videoWidth;
        filteredCanvas.height = videoElement.videoHeight;
        drawFilteredFrame();
        
        console.log('Webcam initialized successfully');
    } catch (error) {
        console.error('Error accessing webcam:', error);
    }
}

async function detectMood() {
    if (!modelIsLoaded) return;

    try {
        const detections = await faceapi.detectAllFaces(videoElement, new faceapi.SsdMobilenetv1Options())
            .withFaceExpressions();

        if (detections.length > 0) {
            const mood = getMostLikelyMood(detections[0].expressions);
            moodData.push({ timestamp: new Date(), mood: mood });
            displayMood(mood);
            updateMoodChart();
        }
    } catch (error) {
        //console.error('Error detecting mood:', error);
    }
}

function updateMoodChart() {
    const ctx = document.getElementById('moodChart').getContext('2d');
    const labels = moodData.map(d => d.timestamp.toLocaleTimeString());
    const data = moodData.map(d => d.mood);

    if (!moodChart) {
        moodChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Mood',
                    data: data,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } else {
        moodChart.data.labels = labels;
        moodChart.data.datasets[0].data = data;
        moodChart.update();
    }
}

function getMostLikelyMood(expressions) {
    return Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
}

function displayMood(mood) {
    const moodDisplay = document.getElementById('moodDisplay');
    if (moodDisplay) {
        moodDisplay.textContent = `Current Mood: ${mood}`;
    }
}

function drawFilteredFrame() {
    filteredCtx.drawImage(videoElement, 0, 0);
    applyFilter(filteredCtx, filteredCanvas.width, filteredCanvas.height);

    filteredCtx.strokeStyle = 'black';
    filteredCtx.lineWidth = 5;
    filteredCtx.strokeRect(0, 0, filteredCanvas.width, filteredCanvas.height);

    detectMood();
    requestAnimationFrame(drawFilteredFrame);
}


function captureAndDownloadImage() {
    console.log('Capture button clicked');
    if (!videoElement || !videoElement.srcObject) {
        console.error('Video stream not available');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Apply filter
    applyFilter(ctx, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
        console.log('Image blob created');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'webcam_capture_filtered.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Download initiated');
    }, 'image/png');
}

function applyFilter(ctx, width, height) {
    if (currentFilter === 'none') return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    switch (currentFilter) {
        case 'grayscale':
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = data[i + 1] = data[i + 2] = avg;
            }
            break;
        case 'sepia':
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                data[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
                data[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
                data[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
            }
            break;
        case 'invert':
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
            break;
        case 'vintage':
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                data[i] = Math.min(255, (r * 0.9) + (g * 0.05) + (b * 0.05));
                data[i + 1] = Math.min(255, (r * 0.07) + (g * 0.86) + (b * 0.07));
                data[i + 2] = Math.min(255, (r * 0.05) + (g * 0.05) + (b * 0.9));
                data[i] += 20;
                data[i + 1] += 20;
                data[i + 2] += 20;
            }
            break;

        case 'fisheye':
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(centerX, centerY);
            const strength = 1.5; // Adjust this value to control the fisheye effect
            const tempData = new Uint8ClampedArray(data);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const dx = (x - centerX) / radius;
                    const dy = (y - centerY) / radius;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 1) {
                        const newDistance = Math.pow(distance, strength);
                        const newX = Math.round(centerX + radius * newDistance * dx / distance);
                        const newY = Math.round(centerY + radius * newDistance * dy / distance);
                        
                        const srcIndex = (y * width + x) * 4;
                        const destIndex = (newY * width + newX) * 4;
                        
                        data[destIndex] = tempData[srcIndex];
                        data[destIndex + 1] = tempData[srcIndex + 1];
                        data[destIndex + 2] = tempData[srcIndex + 2];
                        data[destIndex + 3] = tempData[srcIndex + 3];
                    }
                }
            }
            break;

        case 'lomo':
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];

                // Faded colors
                data[i] = Math.min(255, Math.max(0, r * 0.8)); // Reduce red intensity
                data[i + 1] = Math.min(255, Math.max(0, g * 0.7)); // Reduce green intensity
                data[i + 2] = Math.min(255, Math.max(0, b * 0.9)); // Slightly reduce blue intensity

                // High contrast
                const contrastFactor = 1.2; // Adjust this for more or less contrast
                data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrastFactor + 128));
                data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrastFactor + 128));
                data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrastFactor + 128));

                // Add a slight vignette effect (optional)
                const x = (i / 4) % width;
                const y = Math.floor((i / 4) / width);
                const distanceToCenter = Math.sqrt(Math.pow((x - width / 2) / (width / 2), 2) + Math.pow((y - height / 2) / (height / 2), 2));
                const vignette = Math.pow(1 - distanceToCenter, 1) + 0.3; // Adjust the power for more or less vignette effect
                data[i] *= vignette;
                data[i + 1] *= vignette;
                data[i + 2] *= vignette;
            }
            break;

        case 'old':
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];

            // Faded colors
            data[i] = Math.min(255, Math.max(0, r * 0.8)); // Reduce red intensity
            data[i + 1] = Math.min(255, Math.max(0, g * 0.7)); // Reduce green intensity
            data[i + 2] = Math.min(255, Math.max(0, b * 0.9)); // Slightly reduce blue intensity

            // Add a warm tone
            data[i] += 10; // Increase red slightly
            data[i + 1] += 5; // Increase green slightly
            data[i + 2] -= 10; // Decrease blue slightly

            // Simulate film grain
            const noise = Math.floor(Math.random() * 10) - 5; // Random noise between -5 and 5
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));

            // Vignette effect
            const x = (i / 4) % width;
            const y = Math.floor((i / 4) / width);
            const distanceToCenter = Math.sqrt(Math.pow((x - width / 2) / (width / 2), 2) + Math.pow((y - height / 2) / (height / 2), 2));
            const vignette = Math.pow(1 - distanceToCenter, 1) + 0.4; // Adjust the power for more or less vignette effect
            data[i] *= vignette;
            data[i + 1] *= vignette;
            data[i + 2] *= vignette;
        }
        break;

    }

    ctx.putImageData(imageData, 0, 0);
}

function startPhotoshoot() {
    console.log("photoshoot button clicked");
    if (photoshootActive) return;
    photoshootActive = true;
    photoshootCount = 0;
    photoshootImages.length = 0;
    countdown(5);
}

function countdown(seconds) {
    const countdownDisplay = document.getElementById('countdownDisplay');
    countdownDisplay.style.display = 'flex';
    countdownDisplay.style.overflow = 'hidden';
    
    clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        countdownDisplay.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(countdownInterval);
            countdownDisplay.style.display = 'none';
            capturePhoto();
        } else {
            seconds--;
        }
    }, 1000);
}

function capturePhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = filteredCanvas.width;
    canvas.height = filteredCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(filteredCanvas, 0, 0);
    
    const photoDataURL = canvas.toDataURL('image/png');
    photoshootImages.push(photoDataURL);

    const photoSlots = document.querySelectorAll('.photoSlot');
    if (photoSlots[photoshootCount]) {
        photoSlots[photoshootCount].src = photoDataURL;
        photoSlots[photoshootCount].style.display = 'block'; // Make sure the image is visible
    }

    photoshootCount++;
    
    if (photoshootCount < 4) {
        countdown(5);
    } else {
        finishPhotoshoot();
    }
}

function finishPhotoshoot() {
    photoshootActive = false;
    console.log('Photoshoot complete!');
    // Here you can implement the logic to save or display the 4 captured images
    // For example, you could create a collage or allow the user to download them as a zip
    displayPhotoshootImages();
}

function displayPhotoshootImages() {
    const filmStripImage = new Image();
    filmStripImage.src = './filmstrip.png';
    
    filmStripImage.onload = async () => {
        const stripWidth = filmStripImage.width;
        const stripHeight = filmStripImage.height;
        
        const combinedCanvas = document.createElement('canvas');
        combinedCanvas.width = stripWidth;
        combinedCanvas.height = stripHeight;
        const combinedCtx = combinedCanvas.getContext('2d');
        
        // Draw the film strip background
        combinedCtx.drawImage(filmStripImage, 0, 0, stripWidth, stripHeight);
        
        const photoWidth = 640;
        const photoHeight = 480;
        const photoX = 50    // Center the photos horizontally
        
        for (let i = 0; i < photoshootImages.length; i++) {
            const img = new Image();
            img.src = photoshootImages[i];
            
            await new Promise((resolve) => {
                img.onload = () => {
                    const photoY = 42 + (photoHeight + 57) * i;
                    combinedCtx.drawImage(img, photoX, photoY, photoWidth, photoHeight);
                    resolve();
                };
            });
        }
        
        // Create a download link for the combined image
        const downloadLink = document.createElement('a');
        downloadLink.href = combinedCanvas.toDataURL('image/png');
        downloadLink.download = 'photostrip.png';
        downloadLink.textContent = 'Download Photo Strip';
        
        downloadLink.style.position = 'fixed';
        downloadLink.style.right = '75px';
        downloadLink.style.top = '77%';
        downloadLink.style.transform = 'translateY(-50%)';
        downloadLink.style.padding = '10px 20px';
        downloadLink.style.backgroundColor = '#4CAF50';
        downloadLink.style.color = 'white';
        downloadLink.style.textDecoration = 'none';
        downloadLink.style.borderRadius = '5px';
        document.body.appendChild(downloadLink);
    };
}

async function initializeApp() {
    console.log('Initializing app');
    await loadModels();
    initializeWebcam();
    const captureBtn = document.getElementById('captureDownloadBtn');
    const filterButtons = document.querySelectorAll('#filterButtons input[type="radio"]');
    document.getElementById('photoshootBtn').addEventListener('click', startPhotoshoot);

    
    if (captureBtn) {
        captureBtn.addEventListener('click', captureAndDownloadImage);
        console.log('Capture button event listener added');
    } else {
        console.error('Capture button not found');
    }

    filterButtons.forEach(button => {
        button.addEventListener('change', function() {
            const selectedFilter = this.value;
            console.log("Selected filter:", selectedFilter);
            currentFilter = selectedFilter;
        });
    });
    }


if (document.readyState === 'loading') {
    console.log('Document fully loaded yet');
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}