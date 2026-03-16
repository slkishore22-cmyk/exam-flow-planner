import React from 'react';

interface StepIndicatorProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const STEPS = ['Upload', 'Verify', 'Configure', 'Allocate'];

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, onStepClick }) => {
  return (
    <div className="flex items-center justify-center gap-2 py-8">
      {STEPS.map((step, i) => (
        <React.Fragment key={step}>
          <div
            className={`flex items-center gap-2 ${i + 1 < currentStep ? 'cursor-pointer' : ''}`}
            onClick={() => {
              if (i + 1 < currentStep) onStepClick(i + 1);
            }}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                i + 1 === currentStep
                  ? 'gold-bg text-foreground'
                  : i + 1 < currentStep
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm font-medium ${
                i + 1 === currentStep
                  ? 'gold-text'
                  : i + 1 < currentStep
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`w-12 h-px ${
                i + 1 < currentStep ? 'bg-foreground' : 'bg-border'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default StepIndicator;
