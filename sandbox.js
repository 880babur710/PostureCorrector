import { FaceLandmarker, FilesetResolver } from "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

console.log("sandbox.js is executing");
let faceLandmarker = null;
let goodHeadPitchAngleObtained = false;
let goodHeadPitchAngle = null;
let headPitchAngle = null;
let adjustedHeadPitchAngle = null;
let goodHeadWebcamDistance = null;
let headWebcamDistance = null;
let countingBadPostureDuration = false;
let badPostureDuration = 0.0;
let startTime = 0.0;
let results = undefined;
let currentWarningMethod;
let warnedUser = false;
// let warningSent = false;
// let startedBlurring = false;
let sharedArray;
let width, height;
// let canvas = document.getElementById("canvasOutput");
// let context = canvas.getContext('2d', { willReadFrequently: true });
let canvas, context;
cv = await cv;


async function createFaceLandmarker() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "./node_modules/@mediapipe/tasks-vision/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: "face_landmarker.task",
        },
        runningMode: "IMAGE",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    window.parent.postMessage({ type: 'sandboxIsReady'}, '*');
}

createFaceLandmarker();        


window.addEventListener('message', (event) => {
    // console.log("Message received in sandbox:", event.data.type);
    if (event.data.type === 'saveGoodPosture') {
        console.log("Message received to save good posture");
        goodHeadWebcamDistance = headWebcamDistance;
        goodHeadPitchAngle = headPitchAngle;
        goodHeadPitchAngleObtained = true;
    } else if (event.data.type === 'frameSize') {
        width = event.data.width;
        height = event.data.height;
        canvas = new OffscreenCanvas(width, height);
        context = canvas.getContext('2d', { willReadFrequently: true });
    } else if (event.data.type === 'processFrame') {
        console.log("Received raw frame");
        const imageData = new ImageData(
            new Uint8ClampedArray(event.data.buffer),
            width,
            height
        );
        // Put the image data directly onto the canvas
        context.putImageData(imageData, 0, 0);
        processFrame();
    } else if (event.data.type === 'warningMethod') {
        currentWarningMethod = event.data.warningMethod;
    }
});


function processFrame() {
    results = faceLandmarker.detect(canvas);
    if (results.faceLandmarks) {
        for (const landmarks of results.faceLandmarks) {
            headWebcamDistance = Math.round(estimateHeadWebcamDistance(landmarks, canvas.height, canvas.width));
            headPitchAngle = estimateHeadPose(landmarks, canvas.height, canvas.width);

            // Obtain calibration angles
            if (typeof headPitchAngle === 'number' && goodHeadPitchAngleObtained) {
        
                adjustedHeadPitchAngle = Math.round(headPitchAngle - goodHeadPitchAngle);
                if (sittingPostureIsBad(adjustedHeadPitchAngle, headWebcamDistance, goodHeadWebcamDistance)) { 
                    if (!countingBadPostureDuration) {
                        countingBadPostureDuration = true;
                        startTime = performance.now();
                    } else {
                        badPostureDuration = Math.round((performance.now() - startTime) / 1000);
                        warnUser(badPostureDuration);
                    }
                } else if (countingBadPostureDuration) {
                    countingBadPostureDuration = false;
                    badPostureDuration = 0;
                    warnedUser = false;
                    if (currentWarningMethod === 'blur') {
                        window.parent.postMessage({ type: 'unblurScreen' }, '*');
                    }
                }
            }
        }
    }
    
    window.parent.postMessage({ 
        type: 'result',
        pitch: adjustedHeadPitchAngle, 
        distance: headWebcamDistance,
        duration: badPostureDuration
    }, '*');

}


function getFacialFeatures(faceLandmarks, frameHeight, frameWidth) {
    const face2dCoordArray = [];
    let nose2dCoord = null;
    const landmarkIndices = [33, 263, 1, 61, 291, 199];
  
    // Iterate through major face landmarks
    for (let index of landmarkIndices){
        const landmark = faceLandmarks[index];
        const x = landmark.x * frameWidth;
        const y = landmark.y * frameHeight;
    
        // Save coordinates of the nose landmark
        if (index === 1) {
            nose2dCoord = { x: x, y: y };
        }
    
        // Save 2d coordinates of major face landmarks
        face2dCoordArray.push([Math.floor(x), Math.floor(y)]);
    }
    
    const face2dCoordMatrix = new cv.Mat(face2dCoordArray.length, 2, cv.CV_64F);
    face2dCoordArray.forEach((pt, i) => {
        face2dCoordMatrix.data64F[i * 2] = pt[0];
        face2dCoordMatrix.data64F[i * 2 + 1] = pt[1];
    });

    return { face2dCoordMatrix: face2dCoordMatrix, nose2dCoord: nose2dCoord };
}
 

function calculateHeadAngles(face2dCoordMatrix, frameHeight, frameWidth) {
    const focalLength = frameWidth;
    /*
    (-165.0, 170.0, -135.0),   Left eye outer corner
    (165.0, 170.0, -135.0),    Right eye outer corner
    (0.0, 0.0, 0.0),           Nose tip
    (-150.0, -150.0, -125.0),  Left mouth corner
    (150.0, -150.0, -125.0),   Right mouth corner
    (0.0, -330.0, -65.0)       Chin
    */
    const face3dCoordMatrix = cv.matFromArray(6, 3, cv.CV_64F, [
        -165.0, 170.0, -135.0, 165.0, 170.0, -135.0,
        0.0, 0.0, 0.0, -150.0, -150.0, -125.0,
        150.0, -150.0, -125.0, 0.0, -330.0, -65.0
    ]);
    
    const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64F, [
        focalLength, 0, frameHeight / 2,
        0, focalLength, frameWidth / 2,
        0, 0, 1
    ]);
    
    const distortionMatrix = new cv.Mat.zeros(4, 1, cv.CV_64F);
    const rotVec = new cv.Mat();
    const transVec = new cv.Mat();
    const success = cv.solvePnP(face3dCoordMatrix, face2dCoordMatrix, 
        cameraMatrix, distortionMatrix, rotVec, transVec);
    
    if (!success) {
        return [null, null, null];
    }
    
    const rotationMatrix = new cv.Mat();
    cv.Rodrigues(rotVec, rotationMatrix);
    let rotMatrixArray = matToArray(rotationMatrix);    
    let pitchAngle = rotationMatrixToEulerAngles(rotMatrixArray);  
    
    if (pitchAngle > 0) {
        pitchAngle = 180 - pitchAngle;
    } else {
        pitchAngle = -180 - pitchAngle;
    }
  
    return pitchAngle;
}


function matToArray(mat) {
    if (mat.rows !== 3 || mat.cols !== 3) {
        throw new Error('Matrix must be 3x3.');
    }

    let array = [];
    for (let i = 0; i < 3; i++) {
        array[i] = [mat.doubleAt(i, 0), mat.doubleAt(i, 1), mat.doubleAt(i, 2)];
    }

    return array;
}


function rotationMatrixToEulerAngles(R) {
    let sy = Math.sqrt(R[0][0] * R[0][0] + R[1][0] * R[1][0]);
    let singular = sy < 1e-6; // If sy is close to zero, then we have a singularity

    let pitchAngle;

    if (!singular) {
        pitchAngle = Math.atan2(R[2][1], R[2][2]);
    } else {
        pitchAngle = Math.atan2(-R[1][2], R[1][1]);
    }
    
    // Converting angles from radians to degrees
    pitchAngle = pitchAngle * (180 / Math.PI);

    return pitchAngle; 
}


function estimateHeadPose(faceLandmarks, frameHeight, frameWidth) {
    const { face2dCoordMatrix, nose2d } = getFacialFeatures(faceLandmarks, frameHeight, frameWidth);
    const pitchAngle = calculateHeadAngles(face2dCoordMatrix, frameHeight, frameWidth);
  
    return pitchAngle
}


function estimateHeadWebcamDistance(faceLandmarks, frameHeight, frameWidth) {
    const leftEyePupil = 473  // Index for mediapipe landmark
    const rightEyePupil = 468  // Index for mediapipe landmark
    const averagePupillaryDistance = 6.3  // in cm
    const leftEye = faceLandmarks[leftEyePupil];
    const rightEye = faceLandmarks[rightEyePupil];
  
    const leftEyeX = leftEye.x * frameWidth;
    const leftEyeY = leftEye.y * frameHeight;
    const rightEyeX = rightEye.x * frameWidth;
    const rightEyeY = rightEye.y * frameHeight;
  
    const imageEyeDistance = Math.sqrt(Math.pow(rightEyeX - leftEyeX, 2) + Math.pow(rightEyeY - leftEyeY, 2));
    const focalLength = frameWidth;
  
    return (focalLength / imageEyeDistance) * averagePupillaryDistance;
}
  

function sittingPostureIsBad(headPitchAngle, headDistance, goodHeadDistance) {
    if (headPitchAngle < -10 || (goodHeadDistance - headDistance) > 10) {
        return true;
    }
    return false;
}


function warnUser(badPostureDuration) {
    if (currentWarningMethod === 'notification' && 5 <= badPostureDuration && !warnedUser) {
        window.parent.postMessage({ type: 'sendNotification' }, '*');
        warnedUser = true;
    } else if (currentWarningMethod === 'blur' && 5 <= badPostureDuration && !warnedUser) {
        window.parent.postMessage({ type: 'blurScreen' }, '*');
        warnedUser = true;
    }
}