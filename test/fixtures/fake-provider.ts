// A pi extension for the integration tests: a model provider "faux" whose model "echo" writes the
// system prompt it receives to $CAPTURE_FILE and answers "ok". No network, no credentials.
import { writeFileSync } from "node:fs";
import { fauxAssistantMessage, fauxProvider, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function fakeProvider(pi: ExtensionAPI): void {
  const faux = fauxProvider({ provider: "faux", models: [{ id: "echo" }] });
  faux.setResponses([
    (context) => {
      writeFileSync(process.env.CAPTURE_FILE ?? "", getCurrentSystemPrompt(context.messages));
      return fauxAssistantMessage("ok");
    },
  ]);
  pi.registerProvider(faux.provider);
}
