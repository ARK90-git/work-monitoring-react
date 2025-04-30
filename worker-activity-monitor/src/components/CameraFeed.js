import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

const CameraFeed = ({ onActivity, resetWorkers }) => {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);
  const lastKeypointsRef = useRef({});
  const nextPersonIdRef = useRef(1);
  // Move lastPositionsRef to component level
  const lastPositionsRef = useRef({});
  
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [workersStatus, setWorkersStatus] = useState([]);
  const [detectedPeopleIds, setDetectedPeopleIds] = useState({});

  // Reset worker IDs when resetWorkers changes
  useEffect(() => {
    if (resetWorkers) {
      // Reset the next person ID counter
      nextPersonIdRef.current = 1;
      
      // Clear tracking of detected people
      setDetectedPeopleIds({});
      
      // Clear last keypoints
      lastKeypointsRef.current = {};
      
      // Clear worker status
      setWorkersStatus([]);
      
      // Clear last positions
      lastPositionsRef.current = {};
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
      }
    };

    initializeDetector();
    
    // Cleanup function
    return () => {
      if (detectorRef.current) {
        // No explicit cleanup needed for MoveNet
        console.log("Cleaning up detector resources");
      }
    };
  }, []);

  // Initialize camera
  useEffect(() => {
    let videoElement = null;
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
        
        videoElement = videoRef.current;
        if (videoElement) {
          videoElement.srcObject = stream;
          console.log("Camera stream connected");
        }
      } catch (error) {
        console.error("Error accessing camera:", error);
      }
    };

    setupCamera();
    
    // Cleanup function - store reference to current video element and stream
    return () => {
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        console.log("Camera tracks stopped");
      }
    };
  }, []);

  // Debug output for unique worker tracking
  useEffect(() => {
    console.log("Current unique workers tracked:", Object.keys(detectedPeopleIds).length);
  }, [detectedPeopleIds]);

  // Clean up stale worker IDs periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const currentTimestamp = Date.now();
      const CLEANUP_THRESHOLD = 10000; // 10 seconds
      
      // Get timestamps of last detection for each worker
      const activeWorkers = {};
      workersStatus.forEach(status => {
        activeWorkers[status.id] = new Date(status.timestamp).getTime();
      });
      
      // Check if any workers haven't been seen for a while
      Object.entries(detectedPeopleIds).forEach(([poseId, workerId]) => {
        const lastSeen = activeWorkers[workerId] || 0;
        if (currentTimestamp - lastSeen > CLEANUP_THRESHOLD) {
          // This worker hasn't been seen recently, remove from tracking
          setDetectedPeopleIds(prev => {
            const updated = {...prev};
            delete updated[poseId];
            return updated;
          });
        }
      });
    }, 5000); // Run cleanup every 5 seconds
    
    return () => clearInterval(cleanupInterval);
  }, [detectedPeopleIds, workersStatus]);

  // Run pose detection
  useEffect(() => {
    if (!isModelLoaded) return;
    
    let animationFrameId = null;
    let lastDetectionTime = 0;
    const DETECTION_INTERVAL = 2000; // 2 seconds between detection rounds (lowered from 5s)
    // Store a reference to the video element
    const videoElement = videoRef.current;
    
    // Helper function to calculate center position of a person
    const getCenterPoint = (keypoints) => {
      // We'll use the average of high-confidence keypoints
      let sumX = 0, sumY = 0, count = 0;
      
      // Focus on torso keypoints for more stability
      const torsoPoints = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];
      
      for (const keypoint of keypoints) {
        if (torsoPoints.includes(keypoint.name) && keypoint.score > 0.3) {
          sumX += keypoint.x;
          sumY += keypoint.y;
          count++;
        }
      }
      
      if (count === 0) return null;
      
      return {
        x: sumX / count,
        y: sumY / count
      };
    };
    
    // Find matching person based on position proximity
    const findMatchingPerson = (currentPos, lastPositions) => {
      const MAX_DISTANCE = 100; // Maximum distance to consider the same person (in pixels)
      let bestMatch = null;
      let minDistance = MAX_DISTANCE;
      
      Object.entries(lastPositions).forEach(([id, pos]) => {
        const dx = currentPos.x - pos.x;
        const dy = currentPos.y - pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          bestMatch = id;
        }
      });
      
      return bestMatch;
    };
    
    const detectPoses = async (timestamp) => {
      if (!detectorRef.current || !videoElement || videoElement.readyState < 2) {
        animationFrameId = requestAnimationFrame(detectPoses);
        return;
      }

      // Only run detection at specified intervals
      if (timestamp - lastDetectionTime >= DETECTION_INTERVAL) {
        lastDetectionTime = timestamp;
        
        try {
          // Multi-person pose estimation
          const poses = await detectorRef.current.estimatePoses(videoElement, {
            maxPoses: 5,
            flipHorizontal: false
          });
          
          const currentTimestamp = new Date().toISOString();
          const newStatuses = [];
          const currentPoseIds = new Set();
          
          // Track people using position and assign consistent worker IDs
          for (const pose of poses) {
            const centerPoint = getCenterPoint(pose.keypoints);
            // Only proceed if we have valid coordinates
            if (!centerPoint) continue;
            
            // Find the closest matching previous position
            const matchingId = findMatchingPerson(centerPoint, lastPositionsRef.current);
            let personId;
            
            if (matchingId) {
              // We found a match from previous detections
              personId = matchingId;
            } else {
              // This appears to be a new person
              personId = `worker_${nextPersonIdRef.current}`;
              nextPersonIdRef.current += 1;
            }
            
            // Mark this pose ID as currently present
            currentPoseIds.add(personId);
            
            // Update positions for this person
            lastPositionsRef.current[personId] = centerPoint;

            const keypoints = pose.keypoints;
            
            // Compute movement delta
            let delta = 0;
            const prev = lastKeypointsRef.current[personId];
            
            if (prev) {
              for (let i = 0; i < keypoints.length; i++) {
                if (keypoints[i].score > 0.3 && prev[i] && prev[i].score > 0.3) {
                  const dx = keypoints[i].x - prev[i].x;
                  const dy = keypoints[i].y - prev[i].y;
                  delta += Math.sqrt(dx * dx + dy * dy);
                }
              }
            }
            
            // Update reference keypoints
            lastKeypointsRef.current[personId] = keypoints;
            
            // Determine status based on movement
            const MOVEMENT_THRESHOLD = 15; // Adjust this value based on testing
            const status = delta > MOVEMENT_THRESHOLD ? 'Active' : 'Idle';
            
            newStatuses.push({ id: personId, status, timestamp: currentTimestamp });
          }
          
          // Update the tracked IDs
          setDetectedPeopleIds(prev => {
            const updated = {};
            Object.entries(prev).forEach(([poseId, workerId]) => {
              // Keep only IDs that are still present
              if (currentPoseIds.has(workerId)) {
                updated[poseId] = workerId;
              }
            });
            return updated;
          });
          
          if (newStatuses.length > 0) {
            setWorkersStatus(newStatuses);
            onActivity(newStatuses);
          }
        } catch (error) {
          console.error("Error during pose detection:", error);
        }
      }
      
      animationFrameId = requestAnimationFrame(detectPoses);
    };
    
    // Start detection loop
    animationFrameId = requestAnimationFrame(detectPoses);
    
    // Cleanup function
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        console.log("Detection loop stopped");
      }
    };
  }, [isModelLoaded, onActivity]);

  // Get unique workers by combining all current statuses
  const uniqueWorkers = useMemo(() => {
    const uniqueMap = {};
    workersStatus.forEach((status) => {
      uniqueMap[status.id] = status;
    });
    return Object.values(uniqueMap);
  }, [workersStatus]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-96 h-72 border-2 border-gray-300"
          autoPlay
          playsInline
          muted
        />
        {!isModelLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
            Loading pose detection model...
          </div>
        )}
      </div>
      
      <div className="mt-2 text-sm text-gray-600">
        <p>Current tracking: {uniqueWorkers.length} worker(s)</p>
      </div>
      
      <div className="mt-4 flex flex-wrap justify-center w-full">
        {uniqueWorkers.map((w) => (
          <div
            key={w.id}
            className={`m-2 p-3 rounded-lg border ${
              w.status === 'Active' ? 'bg-green-300' : 'bg-red-300'
            }`}
          >
            <h3 className="text-lg font-semibold">{w.id}</h3>
            <p>Status: {w.status}</p>
            <p>{new Date(w.timestamp).toLocaleTimeString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CameraFeed;