let videoElement;
let currentFilter = 'none';
let moodDetectionEnabled = false;
let moodChart;
let modelIsLoaded = false;
let faceDetectionNet, faceExpressionNet;
let moodData = [];
let filteredCanvas, filteredCtx;

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
    if (!moodDetectionEnabled || !modelIsLoaded) return;

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
        console.error('Error detecting mood:', error);
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
    }

    ctx.putImageData(imageData, 0, 0);
}

async function initializeApp() {
    console.log('Initializing app');
    await loadModels();
    initializeWebcam();
    const captureBtn = document.getElementById('captureDownloadBtn');
    const filterSelect = document.getElementById('filterSelect');
    const moodToggle = document.getElementById('moodToggle');
    
    if (captureBtn) {
        captureBtn.addEventListener('click', captureAndDownloadImage);
        console.log('Capture button event listener added');
    } else {
        console.error('Capture button not found');
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            console.log('Filter changed to:', currentFilter);
        });
        console.log('Filter select event listener added');
    } else {
        console.error('Filter select not found');
    }
    if (moodToggle) {
        moodToggle.addEventListener('change', (e) => {
            moodDetectionEnabled = e.target.checked;
            console.log('Mood detection toggled:', moodDetectionEnabled);
        });
        console.log('Mood toggle event listener added');
    } else {
        console.error('Mood toggle not found');
    }
}

if (document.readyState === 'loading') {
    console.log('Document fully loaded yet');
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}