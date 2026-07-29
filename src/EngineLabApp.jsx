import { EngineProvider } from "./engine/core/EngineProvider";
import { RuntimeCanvas } from "./engine/runtime/RuntimeCanvas";
import { EditorShell } from "./editor/EditorShell";
import { PhonePilotPage } from "./phone/PhonePilotPage";

if (window.location.pathname === "/phone-pilot") {
  document.body.dataset.phonePilot = "active";
}

const EngineLabApp = () => (
  window.location.pathname === "/phone-pilot" ? (
    <PhonePilotPage />
  ) : (
    <EngineProvider>
      <main className="canvas-wrapper engine-app">
        <section className="engine-viewport">
          <RuntimeCanvas />
        </section>
        <EditorShell />
      </main>
    </EngineProvider>
  )
);

export default EngineLabApp;
