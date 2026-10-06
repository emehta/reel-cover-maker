"use client";

import { Aperture, CameraRotate, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/reel-cover-maker/ReelCoverMaker.module.css";

interface Props {
  /** Called with the picture taken, as a file the page reads like an upload. */
  onCapture: (file: Blob) => void;
  onClose: () => void;
}

/**
 * A computer's camera, to take the photo behind the cover: a live view, a
 * shutter, and a turn to the next camera where there is more than one. A
 * phone uses its own camera app instead (`capture` on the file field), so
 * this is the desktop's. The camera is let go the moment the window closes.
 *
 * The view of the camera facing you is mirrored, as a mirror is, so moving
 * left moves left; the picture taken is not, as the camera saw it. Flip
 * mirrors it afterwards.
 */
export function Camera({ onCapture, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  /** Whether the camera faces you, so its view is shown mirrored. */
  const [mirror, setMirror] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // The camera, while the window is open: asked for again when another is chosen.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let gone = false;
    const video = videoRef.current;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1920 } } : { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (gone) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setLive(true);
        setProblem(null);
        const all = await navigator.mediaDevices.enumerateDevices();
        if (gone) return;
        const cameras = all.filter((d) => d.kind === "videoinput");
        setDevices(cameras);
        const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
        setMirror(facing ? facing === "user" : !deviceId || cameras.length <= 1 || cameras[0].deviceId === deviceId);
      } catch (error) {
        if (gone) return;
        const name = error instanceof DOMException ? error.name : "";
        setProblem(
          name === "NotAllowedError" || name === "SecurityError"
            ? "The camera is blocked for this page. Allow it in the browser's settings, or upload a photo."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found. Upload a photo instead."
              : "The camera could not be started. Upload a photo instead.",
        );
        setLive(false);
      }
    };
    void start();
    return () => {
      gone = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    };
  }, [deviceId]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      "image/jpeg",
      0.92,
    );
  };

  const nextCamera = () => {
    if (devices.length < 2) return;
    const at = devices.findIndex((d) => d.deviceId === deviceId);
    setDeviceId(devices[(at + 1) % devices.length].deviceId);
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.cameraDialog}
      aria-label="Take a photo"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.cameraView}>
        <video ref={videoRef} className={styles.cameraVideo} style={mirror ? { transform: "scaleX(-1)" } : undefined} playsInline muted autoPlay />
        {problem && <p className={styles.cameraProblem}>{problem}</p>}
        <button type="button" className={styles.cameraClose} onClick={onClose} aria-label="Close the camera">
          <X size={18} weight="bold" />
        </button>
      </div>
      <div className={styles.cameraBar}>
        <span className={styles.cameraSide}>
          {devices.length > 1 && (
            <button type="button" className={styles.cameraRound} onClick={nextCamera} aria-label="Next camera" title="Next camera">
              <CameraRotate size={20} weight="bold" />
            </button>
          )}
        </span>
        <button type="button" className={styles.shutter} onClick={shoot} disabled={!live} aria-label="Take the photo" title="Take the photo">
          <Aperture size={26} weight="bold" />
        </button>
        <span className={styles.cameraSide} />
      </div>
    </dialog>
  );
}
