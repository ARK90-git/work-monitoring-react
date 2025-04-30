import React, { useEffect, useRef, useState } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

const CameraFeed = ({ onActivity, resetWorkers }) => {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const workerTrackingRef = useRef({});  // Track worker positions and movement
  const nextWorkerIdRef = useRef(1);
  
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [cameraError, setCameraError] = useState(null);

  // Reset tracking when requested
  useEffect(() => {
    if (resetWorkers) {
      nextWorkerIdRef.current = 1;
      workerTrackingRef.current = {};
      setWorkers([]);
    }
  }, [resetWorkers]);

  // Initialize TensorFlow and pose detector
  useEffect(() => {
    const initializeDetector = async () => {
      try {
        console.log("Setting up TensorFlow backend...");
        await tf.setBackend('webgl');
        await tf.ready();
        
        console.log("Creating pose detector...");
        detectorRef.current = await poseDetection.createDetector(
          poseDetection.SupportedModels.MoveNet,
          { 
            modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
            enableTracking: true,
            trackerType: 'boundingBox'
          }
        );
        
        setIsModelLoaded(true);
        console.log("Pose detector ready");
      } catch (error) {
        console.error("Error initializing detector:", error);
        setCameraError("Failed to initialize pose detector");
      }
    };

    initializeDetector();
    
    return () => {
      // Cleanup
      if (detectorRef.current) {
        console.log("Cleaning up detector resources");
      }
    };
  }, []);

  // Initialize camera
  useEffect(() => {
    let stream = null;
    
    const setupCamera = async () => {
      try {
        console.log("Requesting camera access...");
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 640,
            height: 480,
            facingMode: 'user'
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          console.log("Camera stream connected");
        }
      } catch (error) {
        console.error("Error accessing camera:", error);
        setCameraError("Could not access camera. Please check permissions.");
      }
    };

    setupCamera();
    
    return () => {
      // Cleanup camera stream
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        console.log("Camera tracks stopped");
      }
    };
  }, []);

  // Worker detection and activity tracking
  useEffect(() => {
    if (!isModelLoaded || !videoRef.current) return;
    
    let animationFrameId = null;
    let lastDetectionTime = 0;
    const DETECTION_INTERVAL = 500; // Half second between detections for better responsiveness
    const MOVEMENT_THRESHOLD = 5; // Much lower threshold to detect subtle movements
    const POSITION_MATCH_THRESHOLD = 80; // Maximum distance to consider the same person
    const WORKER_TIMEOUT = 5000; // How long to keep tracking a worker after they disappear
    
    // Helper function to get the center position of a person from keypoints
    const getPersonPosition = (keypoints) => {
      // Focus on stable torso points
      const torsoPoints = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];
      let sumX = 0, sumY = 0, count = 0;
      
      keypoints.forEach(point => {
        if (torsoPoints.includes(point.name) && point.score > 0.3) {
          sumX += point.x;
          sumY += point.y;
          count++;
        }
      });
      
      if (count === 0) return null;
      return { x: sumX / count, y: sumY / count };
    };
    
    // Match a detected person with existing tracked workers
    const matchWorker = (position) => {
      let bestMatch = null;
      let minDistance = POSITION_MATCH_THRESHOLD;
      
      Object.entries(workerTrackingRef.current).forEach(([workerId, data]) => {
        if (!data.position) return;
        
        const dx = position.x - data.position.x;
        const dy = position.y - data.position.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = workerId;
        }
      });
      
      return bestMatch;
    };
    
    // Calculate movement between current and previous positions with enhanced sensitivity
    const calculateMovement = (keypoints, previousKeypoints) => {
      if (!previousKeypoints) return 10; // Default to some movement for new detections
      
      let totalMovement = 0;
      let pointsChecked = 0;
      
      // Focus on hand, wrist and arm movements which are common in workplace tasks
      const importantPoints = ['left_wrist', 'right_wrist', 'left_elbow', 'right_elbow', 'left_hand', 'right_hand'];
      
      // Check movement of high-confidence keypoints
      keypoints.forEach((point, index) => {
        // Give higher weight to hand/arm movements
        const isImportantPoint = importantPoints.includes(point.name);
        const weightMultiplier = isImportantPoint ? 2.0 : 1.0;
        
        // Lower confidence threshold for movement detection
        if (point.score > 0.2 && previousKeypoints[index]?.score > 0.2) {
          const dx = point.x - previousKeypoints[index].x;
          const dy = point.y - previousKeypoints[index].y;
          const pointMovement = Math.sqrt(dx*dx + dy*dy) * weightMultiplier;
          totalMovement += pointMovement;
          pointsChecked++;
        }
      });
      
      return pointsChecked > 0 ? totalMovement / pointsChecked : 0;
    };
    
    const detectPoses = async (timestamp) => {
      if (!detectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        animationFrameId = requestAnimationFrame(detectPoses);
        return;
      }

      // Run detection at specified intervals
      if (timestamp - lastDetectionTime >= DETECTION_INTERVAL) {
        lastDetectionTime = timestamp;
        
        try {
          // Get all poses from the detector
          const poses = await detectorRef.current.estimatePoses(videoRef.current, {
            maxPoses: 10,  // Detect more poses to handle crowded scenes
            flipHorizontal: false
          });
          
          const currentTime = Date.now();
          const detectedWorkerIds = new Set();
          const activityUpdates = [];
          
          // Process detected poses
          for (const pose of poses) {
            // Skip low confidence detections
            if (pose.score < 0.25) continue;
            
            const position = getPersonPosition(pose.keypoints);
            if (!position) continue; // Skip if we can't establish a position
            
            // Try to match with existing worker
            let workerId = matchWorker(position);
            let isNewWorker = false;
            
            if (!workerId) {
              // Create new worker if no match found
              workerId = `worker_${nextWorkerIdRef.current++}`;
              isNewWorker = true;
              
              workerTrackingRef.current[workerId] = {
                position: position,
                lastSeen: currentTime,
                previousKeypoints: null,
                status: 'Active',  // New workers start as active
                movementHistory: [30, 20, 15, 10, 8], // Start with assumed movement history
                lastStatusChange: currentTime
              };
            }
            
            // Update this worker as seen
            detectedWorkerIds.add(workerId);
            const worker = workerTrackingRef.current[workerId];
            
            // Calculate movement since last frame
            const movement = calculateMovement(pose.keypoints, worker.previousKeypoints);
            
            // Update tracking data
            worker.previousKeypoints = [...pose.keypoints];
            worker.position = position;
            worker.lastSeen = currentTime;
            
            // Update movement history with smoothing
            worker.movementHistory.push(movement);
            if (worker.movementHistory.length > 5) worker.movementHistory.shift(); // Use fewer frames for faster response
            
            // Use maximum recent movement instead of average to better detect short bursts of activity
            const recentMax = Math.max(...worker.movementHistory);
            const avgMovement = Math.max(
              recentMax,
              worker.movementHistory.reduce((sum, val) => sum + val, 0) / worker.movementHistory.length
            );
            
            // Determine status based on average movement
            const newStatus = avgMovement > MOVEMENT_THRESHOLD ? 'Active' : 'Idle';
            
            // More responsive status changes with shorter debounce time
            const timeSinceStatusChange = currentTime - worker.lastStatusChange;
            
            // If status is changing from Idle to Active, respond quickly
            // If changing from Active to Idle, require more consistent inactivity
            const debounceTime = newStatus === 'Active' ? 500 : 3000;
            
            if (newStatus !== worker.status && 
                (isNewWorker || timeSinceStatusChange > debounceTime)) {
              worker.status = newStatus;
              worker.lastStatusChange = currentTime;
              
              // Add to activity updates
              activityUpdates.push({
                id: workerId,
                status: newStatus,
                timestamp: new Date().toISOString()
              });
            }
            
            // Also send periodic updates even without status change (every 10 seconds)
            else if (currentTime - worker.lastStatusChange > 10000) {
              worker.lastStatusChange = currentTime;
              
              // Add status update with current status
              activityUpdates.push({
                id: workerId,
                status: worker.status,
                timestamp: new Date().toISOString()
              });
            }
          }
          
          // Clean up workers who haven't been seen recently
          Object.keys(workerTrackingRef.current).forEach(id => {
            const worker = workerTrackingRef.current[id];
            
            // If this worker wasn't detected in this frame but still tracked
            if (!detectedWorkerIds.has(id)) {
              if (currentTime - worker.lastSeen > WORKER_TIMEOUT) {
                // Worker has left, remove from tracking
                delete workerTrackingRef.current[id];
              }
            }
          });
          
          // Update worker state for display
          const currentWorkers = Object.entries(workerTrackingRef.current).map(([id, data]) => ({
            id,
            status: data.status,
            lastSeen: new Date(data.lastSeen).toLocaleTimeString()
          }));
          
          setWorkers(currentWorkers);
          
          // Send activity updates if any
          if (activityUpdates.length > 0) {
            onActivity(activityUpdates);
          }
        } catch (error) {
          console.error("Error during pose detection:", error);
        }
      }
      
      animationFrameId = requestAnimationFrame(detectPoses);
    };
    
    // Start detection loop
    animationFrameId = requestAnimationFrame(detectPoses);
    
    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isModelLoaded, onActivity]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-96 h-72 border-2 border-gray-300 rounded-lg"
          autoPlay
          playsInline
          muted
        />
        {!isModelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white rounded-lg">
            {cameraError || "Loading pose detection model..."}
          </div>
        )}
      </div>
      
      <div className="mt-2 text-sm text-gray-600">
        <p>Currently tracking: {workers.length} worker(s)</p>
      </div>
      
      <div className="mt-4 flex flex-wrap justify-center gap-2 w-full">
        {workers.map((worker) => (
          <div
            key={worker.id}
            className={`p-3 rounded-lg border ${
              worker.status === 'Active' 
                ? 'bg-green-100 border-green-500 text-green-800' 
                : 'bg-red-100 border-red-500 text-red-800'
            }`}
          >
            <h3 className="text-lg font-semibold">{worker.id}</h3>
            <p>Status: {worker.status}</p>
            <p className="text-xs">Last seen: {worker.lastSeen}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CameraFeed;