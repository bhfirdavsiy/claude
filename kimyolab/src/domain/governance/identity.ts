// The one list of automation identities that can never act as a human author or reviewer (assessment, chemistry KB,
// release decisions, structured theory). Browser-safe (no Node imports) so the learner runtime can use it too.
export const AUTOMATION_IDENTITY=/(^|[^a-z])(ai|bot|claude|gpt|chatgpt|openai|anthropic|codex|copilot|gemini|llm|agent|automation|autoapprove|script|ci|github-actions|dependabot|renovate)([^a-z]|$)/i;
/** A human identity check: the shared automation list plus common short forms (system, kimyolab-bot, machine…). */
export const isAutomationIdentity=(id:string)=>AUTOMATION_IDENTITY.test(id)||/^(?:system|kimyolab-bot|machine)(?:[.\-_].*)?$/i.test(id);
