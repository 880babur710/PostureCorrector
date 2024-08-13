import cv2 as cv
import numpy as np
import mediapipe as mp
import time

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True,
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils
drawing_spec = mp_drawing.DrawingSpec(thickness=1, circle_radius=1)

LEFT_EYE_PUPIL = 473  # The index for mediapipe landmark
RIGHT_EYE_PUPIL = 468  # The index for mediapipe landmark
AVERAGE_PUPILLARY_DISTANCE = 6.3  # in cm


def get_face_landmarks(frame):
    """
    Process the frame to get face landmarks.
    :param frame: frame returned by using the `read()` method on a
    VideoCapture object

    :return: Returns the original frame passed in and results of the face
    mesh that was processed on the same frame
    """
    frame_rgb = cv.cvtColor(cv.flip(frame, 1), cv.COLOR_BGR2RGB)
    # To improve performance
    frame_rgb.flags.writeable = False
    # Get the result
    results = face_mesh.process(frame_rgb)
    # To improve performance
    frame_rgb.flags.writeable = True
    # Convert the colour space from RGB to BGR
    frame_bgr = cv.cvtColor(frame_rgb, cv.COLOR_RGB2BGR)

    return frame_bgr, results


def get_facial_features(frame, face_landmarks):
    """Extract 2D and 3D facial features."""
    frame_height, frame_width, _ = frame.shape
    face_2d = []
    nose_2d = None

    landmark_indices = [33, 263, 1, 61, 291, 199]

    for index in landmark_indices:
        landmark = face_landmarks.landmark[index]
        x, y = landmark.x * frame_width, landmark.y * frame_height

        if index == 1:
            nose_2d = (x, y)

        # Get the 2d coordinates
        face_2d.append([int(x), int(y)])

    face_2d_array = np.array(face_2d, dtype=np.float64)
    face_3d_array = np.array([
        (-165.0, 170.0, -135.0),   # Left eye outer corner
        (165.0, 170.0, -135.0),    # Right eye outer corner
        (0.0, 0.0, 0.0),           # Nose tip
        (-150.0, -150.0, -125.0),  # Left mouth corner
        (150.0, -150.0, -125.0),   # Right mouth corner
        (0.0, -330.0, -65.0)       # Chin
    ], dtype=np.float64)

    return face_2d_array, face_3d_array, nose_2d


def calculate_head_pose(face_2d, face_3d, frame):
    """Calculate the head pose using solvePnP."""
    frame_height, frame_width, _ = frame.shape
    focal_length = 1 * frame_width
    camera_matrix = np.array([[focal_length, 0, frame_height / 2],
                              [0, focal_length, frame_width / 2],
                              [0, 0, 1]])
    distortion_matrix = np.zeros((4, 1), dtype=np.float64)
    success, rot_vec, trans_vec = cv.solvePnP(face_3d, face_2d, camera_matrix,
                                              distortion_matrix)
    if not success:
        return None, None, None

    rotation_matrix, _ = cv.Rodrigues(rot_vec)
    angles, mtxR, mtxQ, Qx, Qy, Qz = cv.RQDecomp3x3(rotation_matrix)
    x, y, z = angles

    if x > 0:
        x = 180 - x
    else:
        x = -180 - x

    return [int(x), int(y), int(z)]


def adjust_angles(current_angles, calibration_angles):
    """
    Adjust `current_angles` using `calibration_angles` so that all the
    angles are 0 when the user is looking straight forward.
    """
    return np.subtract(current_angles, calibration_angles)


def estimate_head_webcam_distance(face_landmarks, frame_width, frame_height):
    # Get the eye landmarks
    left_eye = face_landmarks.landmark[LEFT_EYE_PUPIL]
    right_eye = face_landmarks.landmark[RIGHT_EYE_PUPIL]

    # Calculate the distance between the eyes in pixels
    focal_length = frame_width
    left_eye_x = left_eye.x * frame_width
    left_eye_y = left_eye.y * frame_height
    right_eye_x = right_eye.x * frame_width
    right_eye_y = right_eye.y * frame_height
    image_eye_distance = ((right_eye_x - left_eye_x) ** 2 + (right_eye_y - left_eye_y) ** 2) ** 0.5

    return (focal_length / image_eye_distance) * AVERAGE_PUPILLARY_DISTANCE


def estimate_head_pose(frame, face_landmarks):
    face_2d, face_3d, nose_2d = get_facial_features(frame, face_landmarks)
    angles = calculate_head_pose(face_2d, face_3d, frame)

    return angles


def sitting_posture_is_bad(head_angles, head_distance, good_head_distance):
    """
    Returns True if the sitting posture of the user is bad. Otherwise,
    returns False.
    """
    if head_angles[0] < -10 or (good_head_distance - head_distance) > 10:
        return True

    return False


def main():
    webcam = cv.VideoCapture(0)
    if not webcam.isOpened():
        print("Error: Could not open webcam.")
        return

    try:
        success, frame = webcam.read()
        calibration_angles_obtained = False
        calibration_angles = None
        good_head_webcam_distance = None
        counting_bad_posture_time = False
        bad_posture_time: float = 0.0
        start_time: float = 0.0

        while success:
            frame, results = get_face_landmarks(frame)
            if results.multi_face_landmarks:
                for face_landmarks in results.multi_face_landmarks:
                    # Obtain the distance between head and webcam and the
                    # head pose angles
                    head_webcam_distance = estimate_head_webcam_distance(face_landmarks, frame.shape[1], frame.shape[0])
                    angles = estimate_head_pose(frame, face_landmarks)

                    # Obtain calibration angles
                    if angles is not None:
                        if not calibration_angles_obtained:
                            calibration_key = cv.waitKey(5) & 0xFF
                            if calibration_key == ord('c') or calibration_key == ord('C'):
                                calibration_angles = angles
                                calibration_angles_obtained = True
                                good_head_webcam_distance = head_webcam_distance
                        else:
                            adjusted_angles = adjust_angles(angles, calibration_angles)
                            cv.putText(frame, f"x: {adjusted_angles[0]}", (20, 50), cv.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 1)
                            cv.putText(frame, f"y: {adjusted_angles[1]}", (20, 150), cv.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 1)
                            cv.putText(frame, f"z: {adjusted_angles[2]}", (20, 250), cv.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 1)
                            if sitting_posture_is_bad(adjusted_angles, head_webcam_distance, good_head_webcam_distance):
                                if not counting_bad_posture_time:
                                    counting_bad_posture_time = True
                                    start_time = time.time()
                                else:
                                    bad_posture_time = round(time.time() - start_time, 2)
                                    # if bad_posture_time > 15:
                                    # pause_media_and_disable_interactions(chrome_driver)
                            else:
                                if counting_bad_posture_time:
                                    counting_bad_posture_time = False
                                    bad_posture_time = 0.0
                                    # enable_interactions(chrome_driver)


            # cv.putText(frame, f"Bad Posture Time: {int(bad_posture_time)} sec",
            #            (20, 50), cv.FONT_HERSHEY_SIMPLEX, 1, (255, 191, 0), 1)
            cv.imshow('Webcam', frame)
            program_termination_key = cv.waitKey(5) & 0xFF
            if program_termination_key == ord('q') or program_termination_key == ord('Q'):
                break

            success, frame = webcam.read()
    finally:
        webcam.release()
        cv.destroyAllWindows()


if __name__ == "__main__":
    main()
