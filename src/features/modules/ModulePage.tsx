import type { AppModule } from '../permissions/moduleAccess';

interface ModulePageProps {
  module: AppModule;
}

export function ModulePage({ module }: ModulePageProps) {
  return (
    <section className="module-page">
      <p className="module-family">{module.family}</p>
      <h1>{module.label}</h1>
      <p>Module pret pour migration depuis le Dashboard BBTM.</p>
    </section>
  );
}
