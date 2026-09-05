/** Public positioning. Product descriptions distinguish the launch goal from availability. */
export const FOOTER = "Practical tools for modern legal work.";
export const DISPATCH = {
  name: "Agmt Dispatch",
  heading: "A better way of working. In the making.",
  body: "Follow what we’re building. Leave your details for beta and launch updates, starting with Proof.",
  consent: "Email me about Agmt’s beta openings and product launches.",
};
export const PLATFORM = {
  eyebrow: "Practical tools for modern legal work",
  heading: "More room for judgment.",
  lede: "Legal work asks a lot of you. The repetitive parts shouldn’t. We’re building focused tools to take care of the work around the work. Starting with Proof.",
  direction:
    "Agmt is a legal-tech platform in development. Agreements are our starting point. The ambition is broader: useful tools for the everyday work of legal professionals.",
};
// Retained exports support existing beta components without changing their integration.
export const BETA = {
  headline: DISPATCH.heading,
  capacity: "Follow the work as it takes shape.",
  body: DISPATCH.body,
  aside: "Updates are separate from product access.",
  emailHelper: "The address where you’d like to hear from us.",
  reminderNote: "Updates do not reserve a beta place.",
};
export const FLOW = [
  { step: "Upload", note: "A supported Word agreement" },
  { step: "Proof", note: "A focused mechanical check" },
  { step: "Download", note: "Word markup for your review" },
] as const;
export const LEGAL = [
  "Agmt is developing practical software for legal professionals. The wider platform is not yet launched. Proof is the first product in development.",
  "Product descriptions explain what we are building. They are not a guarantee of availability, coverage or accuracy. Software does not replace professional judgment or provide legal advice.",
  "The updates form collects your name and email address to record your request for beta and product-launch emails. It does not create an account or reserve product access. An existing beta booking is not changed by signing up for updates.",
  "This website does not accept agreements for processing. Before uploading to any Agmt product, review the terms and information presented there.",
];
