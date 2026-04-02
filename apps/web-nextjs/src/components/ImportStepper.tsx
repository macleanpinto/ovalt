interface Step {
  number: number;
  label: string;
  sublabel: string;
  status: 'completed' | 'active' | 'upcoming';
}

interface ImportStepperProps {
  currentStep: number;
}

export default function ImportStepper({ currentStep }: ImportStepperProps) {
  const steps: Step[] = [
    { number: 1, label: 'Connect', sublabel: 'Google Account', status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'active' : 'upcoming' },
    { number: 2, label: 'Select', sublabel: 'GTM Container', status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'active' : 'upcoming' },
    { number: 3, label: 'Analyze', sublabel: 'Import & Review', status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'active' : 'upcoming' },
  ];

  return (
    <aside className="w-72 hidden md:block">
      <div className="sticky top-32 space-y-12">
        <div className="space-y-8">
          {steps.map((step, index) => (
            <div key={step.number}>
              {/* Vertical line before step (except first) */}
              {index > 0 && (
                <div className="relative flex items-center gap-4">
                  <div className="absolute -top-10 left-5 w-[1px] h-8 bg-outline-variant"></div>
                </div>
              )}

              <div className={`flex items-center gap-4 group ${step.status === 'upcoming' ? 'opacity-40' : ''}`}>
                {/* Step Circle */}
                {step.status === 'completed' ? (
                  <div className="w-10 h-10 rounded-full border border-secondary text-secondary flex items-center justify-center font-label font-bold bg-secondary/10">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : step.status === 'active' ? (
                  <div className="w-10 h-10 rounded-full border-2 border-[#ff553c] text-[#ff553c] flex items-center justify-center font-label font-bold">
                    {step.number.toString().padStart(2, '0')}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full border border-outline text-outline flex items-center justify-center font-label font-bold">
                    {step.number.toString().padStart(2, '0')}
                  </div>
                )}

                {/* Step Label */}
                <div className="flex flex-col">
                  <span className={`font-label text-xs uppercase tracking-widest ${
                    step.status === 'completed' ? 'text-secondary' :
                    step.status === 'active' ? 'text-[#ff553c]' :
                    'text-white'
                  }`}>
                    {step.status === 'completed' ? 'Completed' : step.status === 'active' ? 'Active' : 'Upcoming'}
                  </span>
                  <span className="font-bold text-white">{step.label}</span>
                  <span className="text-sm text-on-surface-variant">{step.sublabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* System Note */}
        <div className="p-6 rounded-lg bg-surface-container-low border border-outline-variant/10">
          <h4 className="font-label text-xs uppercase tracking-widest text-[#ff553c] mb-3">System Note</h4>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Ensure you have admin permissions on the Google Account to view and import GTM containers.
          </p>
        </div>
      </div>
    </aside>
  );
}
