import React from 'react';

interface AudioVisualizerProps {
  isRecording: boolean;
  audioLevel: number;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isRecording, audioLevel }) => {
  const barCount = 18;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      height: '36px',
      padding: '0 12px'
    }}>
      {Array.from({ length: barCount }).map((_, index) => {
        // Vary heights based on audio level and center-out pattern
        const distanceFromCenter = Math.abs(index - barCount / 2) / (barCount / 2);
        const factor = Math.max(0.15, 1 - distanceFromCenter * 0.7);
        const dynamicHeight = isRecording
          ? Math.max(6, Math.min(32, (audioLevel * 0.35 + (index % 3) * 4) * factor))
          : 5;

        return (
          <div
            key={index}
            style={{
              width: '4px',
              height: `${dynamicHeight}px`,
              borderRadius: '2px',
              background: isRecording
                ? 'linear-gradient(180deg, #c084fc 0%, #6366f1 100%)'
                : 'rgba(100, 116, 139, 0.3)',
              boxShadow: isRecording && dynamicHeight > 15 ? '0 0 8px rgba(168, 85, 247, 0.4)' : 'none',
              transition: 'height 0.08s ease'
            }}
          />
        );
      })}
    </div>
  );
};
