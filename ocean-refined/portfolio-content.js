// Portfolio copy. Written for hiring managers of forward deployed AI roles (product and engineering): each entry says
// what the problem was, what Anshul did himself, and what changed, with the figure where one exists. Figures for Rae
// and Rae Engage are Twimbit and CelcomDigi product metrics, cleared by Anshul for public use.
export const PORTFOLIO_CONTENT = {
  about: {
    title: "About",
    subtitle: "A product manager who also builds the fix.",
    entries: [
      {
        id: "overview",
        // Structured restatements of this entry's own text, used by the diver profile card.
        name: "Anshul",
        base: "Kuala Lumpur",
        role: "AI product manager and hands-on builder, forward deployed",
        title: "I turn customer problems into working AI.",
        tag: "Forward deployed AI",
        summary: "I work inside the customer’s problem and build part of the answer myself.",
        body: [
          "At Twimbit I run product for Rae, an AI sales platform used by more than 350 enterprise sales staff at CelcomDigi. I talk to the account managers who use it, read the conversation logs and write the evaluation. Then I change the prompts, routing and retrieval rules in the codebase with Claude Code and Codex, and an engineer reviews my changes before release.",
          "I studied computer science, specialising in data science and AI, at Taylor’s University. I spent a year in consulting research before moving into product.",
          "I became a certified diver at ten, which is why this portfolio is also a reef you can swim through."
        ],
        facts: ["Based in Kuala Lumpur", "Customer discovery, evaluation and rollout", "RAG, routing, prompts and agent workflows"],
        links: [
          { label: "LinkedIn", url: "https://www.linkedin.com/in/anshulramprasad/" },
          { label: "GitHub", url: "https://github.com/anshulmao" },
          { label: "Email", url: "mailto:anshulramprasad@gmail.com" }
        ]
      },
      {
        id: "approach",
        title: "Find the cause, then build the fix.",
        tag: "How I work",
        summary: "Four habits I keep on every project.",
        // Each fact is the heading of the paragraph at the same position in body.
        body: [
          "Weekly sessions with account managers told me where Rae was failing them. Thirty months of usage data told me which complaints were common. I prioritise where the two agree.",
          "Rae’s evaluation is 104 cases in English, Malay and Chinese, picked from logged conversations by how often each kind of question came up. A model scores the answers and a person reviews the scores.",
          "Features we released quietly did not keep their users. Each launch now ships with training and follow-up, and I check who came back.",
          "For research content, assistants do the gathering and the fact-checking. An analyst still reads every piece before it is published."
        ],
        facts: ["Pair what people say with what they do", "Test against logged conversations", "Plan the rollout with the release", "Keep a person where judgment matters"],
        links: []
      }
    ]
  },
  experience: {
    title: "Experience",
    subtitle: "Three years at Twimbit, from research to owning an AI product.",
    entries: [
      {
        id: "product-manager",
        title: "Product Manager",
        tag: "Twimbit · Jan 2025 — present",
        // org / start / end restate the tag above for the dive log (end: null means present).
        org: "Twimbit", start: "2025-01", end: null,
        summary: "I own the roadmap, discovery, evaluation and launches for Rae, and I make changes in the product myself.",
        body: [
          "Rae has more than 350 registered users at CelcomDigi and 13 live features. Monthly active users grew from 15 to 175 over the recovery I worked on.",
          "I built a 104-case evaluation in three languages, rewrote the system prompts, and worked on retrieval rules and automatic routing in the FastAPI and Weaviate codebase.",
          "I led delivery of Rae Engage, a customer-facing assistant that produced 219 sales leads between 18 August and 30 October 2026. I also ran weekly sessions with frontline account managers and co-led three training cohorts for more than 150 people."
        ],
        facts: ["350+ users, 13 live features", "Monthly active users 15 → 175", "104-case evaluation in three languages", "Three training cohorts, 150+ people"],
        links: []
      },
      {
        id: "content-operations",
        title: "Product Content Manager",
        tag: "Twimbit · Sep 2024 — Jan 2025",
        org: "Twimbit", start: "2024-09", end: "2025-01",
        summary: "I ran content operations for Rae in a team of three and rebuilt how requests were handled.",
        body: [
          "The publishing calendar missed what frontline sales staff were asking for. I built request intake and triage in Intercom and Typeform, and set up assistants for research and fact-checking. An analyst reviewed every piece before publication.",
          "Output went from about 150 pieces a year to more than 400. A piece that used to take three to five days took a few hours, against a 16-hour request-to-delivery target."
        ],
        facts: ["About 150 → 400+ pieces a year", "Days → hours per piece", "Analyst review on every piece"],
        links: []
      },
      {
        id: "research-foundations",
        title: "Research and advisory",
        tag: "Twimbit · Sep 2023 — Sep 2024",
        org: "Twimbit", start: "2023-09", end: "2024-09",
        // stages and site restate the three facts below, for the dive profile chart and the log sheet.
        stages: [
          { label: "Advisory Maverick", start: "2023-09", end: "2023-12" },
          { label: "Consultant Analyst", start: "2024-01", end: "2024-09" }
        ],
        site: "Kuala Lumpur, Malaysia",
        summary: "I researched customer experience, competitors and AI adoption for technology, telecom and financial-services clients.",
        body: ["The work was customer-experience benchmarking, market research and competitive analysis across the region, ending in recommendations and client presentations."],
        facts: ["Consultant Analyst · Jan 2024 — Sep 2024", "Advisory Maverick · Sep 2023 — Dec 2023", "Kuala Lumpur, Malaysia"],
        links: []
      }
    ]
  },
  projects: {
    title: "Projects",
    subtitle: "Two live products at work, and four things I built on my own.",
    entries: [
      {
        id: "rae",
        title: "Rae",
        tag: "Enterprise AI · Live product",
        summary: "An AI sales platform whose default chat was answering badly. I measured why, then helped fix it.",
        body: [
          "Rae helps CelcomDigi’s enterprise account managers, pre-sales and business development staff answer product questions, research accounts and competitors, and draft proposals.",
          "Twimbit’s launch write-up credits Rae with a supporting role in RM66.6 million of contract wins. I can’t claim a share of that number, but it is the scale the product works at."
        ],
        facts: ["350+ registered users", "Monthly active users 15 → 175", "104 test cases in English, Malay and Chinese"],
        links: [{ label: "Rae’s public product story", url: "https://explorae.salesrechargekit.ai/#overview" }, { label: "Twimbit’s Rae 2.0 write-up", url: "https://twimbit.com/blogs/rae-2-0-powering-the-next-chapter-of-enterprise-sales-excellence-with-celcomdigi" }]
      },
      {
        id: "reengage", title: "Rae Engage", tag: "Customer-facing AI · Live pilot",
        summary: "A website assistant that qualifies business visitors as sales leads. The lead rate among engaged visitors went from 7.0% to 18.1%.",
        body: [
          "My Head of Product set the concept and the overall scope. I owned requirements, success measures, stakeholder alignment, acceptance testing and the conversation design, and I contributed to the build.",
          "The demo build uses FastAPI with streamed model responses, plan cards, structured lead capture and background lead scoring."
        ],
        facts: ["16,854 sessions and 219 leads, 18 Aug – 30 Oct 2026", "Lead rate among engaged visitors 7.0% → 18.1%", "Form completion 25% → 46%", "Satisfaction 4.4 out of 5"],
        links: [{ label: "Open Rae Engage", url: "https://business.celcomdigi.com/plan/postpaid-phone" }]
      },
      {
        id: "wattmana",
        title: "WattMana",
        tag: "Energy · Hackathon build",
        summary: "An electricity bill that explains itself: what changed, and what probably caused it.",
        body: [
          "Built for the Codex Community Hackathon in Kuala Lumpur in July 2026. Malaysian households can see a total and a kWh figure on their bill, but not what changed or which appliance or habit explains it.",
          "I shaped the product and built working web and mobile prototypes on my own."
        ],
        facts: ["React web app and Expo mobile app, TypeScript, Supabase", "Reads the bill as text first, with OCR as the fallback", "Estimates always shown apart from billed figures"],
        links: [{ label: "WattMana · Live demo", url: "https://wattmana-mobile.vercel.app/" }]
      },
      {
        id: "sage",
        title: "Sage",
        tag: "Health AI · Hackathon finalist",
        summary: "A voice-first place to keep your health history, built solo for the Lovable Vibeathon.",
        body: [
          "Friends of mine were managing chronic conditions or recovering from surgery. I had been asking general chatbots health questions that needed my history to answer well.",
          "I entered the Patient Journey Automation track alone, representing Twimbit, and reached the final."
        ],
        facts: ["Voice logging, check-ins, reminders, documents, visit notes and a timeline", "Lovable, Supabase, React and the Web Speech API", "Finalist, Lovable Vibeathon"],
        links: [{ label: "Sage · Live demo", url: "https://sage-personal-health.lovable.app/" }, { label: "Vibeathon post", url: "https://www.linkedin.com/posts/anshulramprasad_vibeathon-lovable-openclaw-activity-7465675358755864576-SeCf" }]
      },
      {
        id: "openclaw",
        title: "OpenClaw",
        tag: "Agents · Three-week experiment",
        summary: "I ran an always-on personal agent for three weeks and wrote up what broke.",
        body: [
          "I kept losing AI articles, videos and documents I meant to come back to, and I wanted to test an agent that lives outside a chat tab.",
          "I set up OpenClaw with Telegram and the Gemini API, wrote its identity, workspace rules, routing and redaction instructions, and ran scheduled jobs and Git sync. I specified a vector knowledge base and had the agent build it."
        ],
        facts: ["Three weeks, at least seven reinstalls", "About RM200 in API spend", "20,000 extra input tokens on one short status request"],
        links: [{ label: "Read the write-up", url: "https://www.linkedin.com/pulse/i-ran-openclaw-three-weeks-heres-what-broke-first-anshul-ramprasad-jtkvc" }, { label: "Visual breakdown", url: "https://www.linkedin.com/posts/anshulramprasad_i-tested-openclaw-for-three-weeks-heres-activity-7474133497457090560-Eth0" }]
      }
    ]
  },
  resume: {
    title: "Resume",
    subtitle: "The work on two pages.",
    entries: [{
      id: "portfolio-resume", title: "The work on two pages.", tag: "Résumé · Forward deployed AI",
      format: "PDF", issued: "October 2026",
      summary: "Two versions, for the two roles I do.",
      body: ["One is written for forward deployed product manager roles and one for forward deployed engineer roles. The history is the same; the emphasis differs."],
      facts: ["Forward deployed AI", "PDF · October 2026"],
      links: [{label:"Download résumé · Product manager",url:"./assets/portfolio/resume-forward-deployed-pm.pdf",download:true},{label:"Download résumé · Engineer",url:"./assets/portfolio/resume-forward-deployed-engineer.pdf",download:true}],
      alternatives: []
    }]
  }

};

// The story of each project: the problem, what was decided and done, what came of it (with the figure, or a plain
// statement that there is none), one takeaway, and where the evidence comes from. A value may be a list of paragraphs.
const PROJECT_STORIES = {
  rae: {
    role: "Product manager, with hands-on work on prompts, routing and retrieval",
    problem: [
      "Account managers told me Rae’s answers could be wrong or unusable. The conversation logs showed why: most people stayed in the default chat mode, and that mode could answer without checking internal documents or the web.",
      "The same analysis turned up documents the system could not reach, and sources that were inconsistent or invented."
    ],
    decision: [
      "I exported the logged queries from Metabase and grouped them with AI-assisted text analysis. From those I built a 104-case test set in English, Malay and Chinese, scored by a model and reviewed by a person.",
      "I rewrote the system prompts for tone, structure, uncertainty and use of sources, and worked on retrieval rules and document access with Claude Code and Codex. We replaced manual mode selection with a router that chooses between internal knowledge, web search and general generation. The team also upgraded the web search API and standardised citations. An engineer reviewed my code and we tested it in staging before release."
    ],
    outcome: [
      "Retests improved and early feedback from users was positive. I don’t have a before-and-after score to show for it.",
      "Over the wider recovery, monthly active users went from 15 to 175."
    ],
    learning: "People use the default. If the default is weak, the product is weak, whatever the other modes can do.",
    evidence: "Screens are from Rae’s public product story. Usage figures are Twimbit and CelcomDigi product metrics."
  },
  reengage: {
    role: "Delivery owner: requirements, conversation design, testing and iteration",
    problem: "CelcomDigi’s registration-of-interest form collected complaints, general enquiries and small-business sales leads in one place. The sales team had no reliable way to tell which submissions were worth a call.",
    decision: [
      "I worked with the sales, customer experience, product, brand and marketing teams to agree what counts as an actionable lead, then scoped a pilot around business mobile plans.",
      "The assistant asks a few qualifying questions, recommends a plan and passes the lead to Salesforce. After launch on 18 August 2026 I read the conversations and the funnel. We shortened qualification, added a “Recommend for me” option, removed a step between choosing a plan and the form, and on 7 September cut the form from seven fields to three."
    ],
    outcome: [
      "Form completion rose from 25% to 46% when the form was shortened. The share of engaged visitors who became leads rose from 7.0% on the first journey to 18.1% on the latest.",
      "By 30 October the pilot had 16,854 sessions, 1,865 engaged conversations and 219 leads, with an average satisfaction score of 4.4 out of 5. A check on 10 September found that all 31 verified leads had reached Salesforce.",
      "What we got wrong: the first journey assumed visitors were new businesses shopping for a plan. Many were existing customers with billing and service questions, which it did not serve. We are widening who it can help."
    ],
    learning: "A good recommendation is not the end of the job. Count the steps between the recommendation and the form, and remove the ones you can.",
    evidence: "Figures are from the pilot’s week 11 status report and the journey analysis. They are Twimbit and CelcomDigi pilot metrics. Purchases after a lead are not measured here."
  },
  wattmana: {
    role: "Solo: product, design and prototypes",
    problem: "My bill changed every month and I could not say why. The charges and adjustments are printed, but not explained.",
    decision: [
      "The app reads the bill by extracting its printed text, and falls back to OCR through a model when that fails. You confirm the extracted fields before anything is saved.",
      "It then tells the bill as a short story, in ringgit and kWh together. Appliance costs are modelled, so they are shown apart from billed figures, each with a confidence range, and usage the model cannot explain is shown as unexplained."
    ],
    outcome: [
      "Working web and mobile prototypes. There are no users, no measured savings and no accuracy figure for the bill reading yet.",
      "One thing I changed: the first version animated counting numbers and rotating cards. It was harder to read, so I replaced it with fixed figures and a simple slide between steps."
    ],
    learning: "If a number is an estimate, say so next to the number.",
    evidence: "Screenshot of the working browser prototype. The research drew on tariff documents and published household studies, not interviews."
  },
  sage: {
    role: "Solo: scope, design and build",
    problem: "Health history lives in memory, on paper and in appointment notes. When you need it, for a doctor or for a question, it is not in one place.",
    decision: [
      "I made speaking the main way in, because typing a daily health log is the step people skip. You talk, Sage proposes what to record, and nothing is saved until you confirm it.",
      "The chat answers only from the information you have given it."
    ],
    outcome: "A working demo with voice logging, check-ins, reminders, documents, visit capture and a timeline. It reached the Vibeathon final. It has no users beyond the demo, and it organises information; it does not give medical advice.",
    learning: "The value is in the history, so the product depends on how little effort it takes to add to it.",
    evidence: "The screenshot is the public demo with no personal health records in it."
  },
  openclaw: {
    role: "Solo: setup, operation and write-up",
    problem: "Always-on agents promise memory and good timing. I wanted to know what that costs to run, and when it is worth it.",
    decision: "I ran one on my own machine with a knowledge base, recurring jobs and Git synchronisation, and kept notes on every failure.",
    outcome: [
      "It worked, expensively. One short status request carried about 20,000 additional input tokens of context. Running it on my laptop caused slowdowns and provider timeouts until I moved it to a desktop. I reinstalled or reconfigured it at least seven times, and spent about RM200 on API calls.",
      "The knowledge base did its job, but every lookup paid the overhead of the always-on agent around it. I published the write-up and a visual breakdown."
    ],
    learning: "Ask where continuity gives an advantage. If a scheduled script would do the job, use the script.",
    evidence: "The diagram is my own summary of the workflow. Figures are from my published write-up."
  },
  'ocean-world': {
    role: "Direction, design decisions and review of AI-written code",
    problem: "I wanted people to explore my work, not only read it, without making the work harder to reach.",
    decision: [
      "There are two ways in: a reading page for someone with a minute, and the ocean for someone with ten.",
      "Early on, features kept missing the behaviour and the look I had asked for. I added written instructions to the repository, had one agent maintain the design system and another run a review pipeline, and wired the tests into continuous integration."
    ],
    outcome: "One test run cut first-load transfer from 42.79 MB to 27.91 MB, and repeat-visit transfer from 17.61 MB to 0.11 MB. Those are single measurements, not production figures. I have no visitor numbers yet.",
    learning: "Agents build what you can check. The written instructions and the tests did more than any single prompt.",
    evidence: "Everything described here can be tried in the ocean itself."
  }
};
PORTFOLIO_CONTENT.projects.entries.push({
  id: "ocean-world", title: "A world to explore", tag: "Creative web · This portfolio",
  summary: "A portfolio you can swim through, built by directing AI coding agents.",
  body: ["A Three.js reef with diver controls, a guided route, a map, dive instruments and a reading page.", "I directed and iterated on the build with Claude Code and Codex."],
  facts: ["Three.js and WebGL, Node build, Vercel hosting", "Playwright and GitHub Actions checks on every change", "First-load transfer 42.79 MB → 27.91 MB in one test run"],
  links: [{ label: "Source on GitHub", url: "https://github.com/anshulmao/ocean-portfolio" }]
});
// Keep the user's priority stories first in both the archive and reading path.
const projectOrder = ['rae', 'reengage', 'sage', 'wattmana', 'ocean-world', 'openclaw'];
PORTFOLIO_CONTENT.projects.entries.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
for (const entry of PORTFOLIO_CONTENT.projects.entries) {
  entry.caseStudy = PROJECT_STORIES[entry.id];
  entry.role = entry.caseStudy.role;
}
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'reengage').gallery = ['reengage-welcome', 'reengage-languages', 'reengage-plan', 'reengage-plan-details'];
Object.assign(PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae'), {
  gallery: ['rae-chat', 'rae-proposals', 'rae-practice', 'rae-documents'],
  galleryTitle: 'Across the sales workflow.',
  galleryIntro: 'Research, proposals, sales practice and document Q&A in one platform.',
  galleryLayout: 'wide'
});
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'rae').diagram = {
  label: "How the default chat was fixed", steps: ["Group the logged queries", "Test 104 cases in three languages", "Route each question automatically"],
  caption: "My own summary of the work · Not a product screen"
};
PORTFOLIO_CONTENT.projects.entries.find(entry => entry.id === 'openclaw').diagram = {
  label: "What the agent ran", steps: ["Keep a knowledge base", "Run scheduled jobs", "Sync to Git"],
  caption: "My own summary of the workflow · Not a product screen"
};
PORTFOLIO_CONTENT.about.entries.find(entry => entry.id === 'approach').examples = [
  { title: "Fix the default", text: "On Rae, most people stayed in the default chat mode, so we replaced manual mode selection with automatic routing.", project: "rae" },
  { title: "Shorten the form", text: "On Rae Engage, cutting the lead form from seven fields to three moved completion from 25% to 46%.", project: "reengage" },
  { title: "Make persistence pay for itself", text: "Three weeks running an always-on agent showed me one short status request could carry 20,000 extra input tokens.", project: "openclaw" }
];

export const PORTFOLIO_MEDIA = {
  overview: { src: './assets/portfolio/anshul-portrait.jpg', alt: 'Anshul Ramprasad outdoors', caption: 'Anshul Ramprasad', kind: 'portrait', width: 720, height: 1080 },
  rae: { src: './assets/portfolio/rae-platform.png', alt: 'Rae home screen with sales, proposal, persona and training tools', caption: 'Rae · Enterprise sales platform', kind: 'product', width: 1870, height: 951 },
  'rae-chat': { src: './assets/portfolio/rae-chat-sources.png', alt: 'Rae Chat response with source links and suggested follow-up questions', caption: 'Research with sources', description: 'Rae Chat shows sources and suggested questions beside the answer.', kind: 'product', width: 1870, height: 951 },
  'rae-proposals': { src: './assets/portfolio/rae-proposal-canvas.png', alt: 'A generated proposal on a canvas beside the Rae conversation', caption: 'Create and refine a proposal', description: 'The canvas keeps the draft beside the conversation for review and edits.', kind: 'product', width: 1874, height: 951 },
  'rae-practice': { src: './assets/portfolio/rae-sales-practice.png', alt: 'Rae Sales Simulator with a customer persona and voice simulation control', caption: 'Practice the conversation', description: 'Sales teams can practice with a customer persona before a real sales conversation.', kind: 'product', width: 1863, height: 917 },
  'rae-documents': { src: './assets/portfolio/rae-document-chat.png', alt: 'Rae DocuChat with a document and an AI question panel side by side', caption: 'Share a document with Q&A', description: 'Rae DocuChat puts a document beside AI answers and suggested questions.', kind: 'product', width: 1855, height: 923 },
  'ocean-world': { src: './assets/portfolio/ocean-world.png', alt: 'The living reef in this browser-based portfolio', caption: 'A world to explore · This portfolio', kind: 'scene', width: 1280, height: 800 },
  reengage: { src: './assets/portfolio/reengage.jpg', alt: 'Rae Engage chat widget open on the CelcomDigi business website', caption: 'Rae Engage · Live public work sample', kind: 'product', width: 1265, height: 712 },
  'reengage-welcome': { src: './assets/portfolio/rae-engage-welcome.png', alt: 'Rae Engage welcome with suggested ways to explore business mobile plans', caption: 'Start a conversation', kind: 'product', width: 373, height: 515 },
  'reengage-languages': { src: './assets/portfolio/rae-engage-languages.png', alt: 'Language menu with English, Bahasa Melayu and Chinese', caption: 'Choose a language', kind: 'product', width: 378, height: 517 },
  'reengage-plan': { src: './assets/portfolio/rae-engage-plan.png', alt: 'Business mobile plan card with its price and key features', caption: 'Explore a plan', kind: 'product', width: 377, height: 515 },
  'reengage-plan-details': { src: './assets/portfolio/rae-engage-plan-details.png', alt: 'Expanded mobile plan card showing contract and roaming details', caption: 'See plan details', kind: 'product', width: 379, height: 517 },
  sage: { src: './assets/portfolio/sage.jpg', alt: 'Sage personal health demo interface', caption: 'Sage · Live demo interface', kind: 'product', width: 1280, height: 720 },
  wattmana: { src: './assets/portfolio/wattmana.png', alt: 'WattMana electricity bill explanation interface', caption: 'WattMana · Working browser prototype', kind: 'product', width: 1440, height: 1000 },
  'portfolio-resume': { src: './assets/portfolio/resume-fdpm-preview.png', alt: 'Preview of the forward deployed product manager résumé', caption: 'Forward deployed AI · October 2026', kind: 'document', width: 850, height: 1100 },
};

// Alternative section introductions for the editor's reading-style selector (not shipped: the build removes the selector).
export const COPY_VARIANTS = {
  concise: {
    label: "Concise",
    about: "AI product manager who finds the cause and builds the fix.",
    experience: "Research, then content operations, then owning an AI product.",
    projects: "Two live products at work and four independent builds.",
    resume: "Two versions: product manager and engineer."
  },
  story: {
    label: "Story",
    about: "I start with the people who use the product, read what they did, and change the product myself.",
    experience: "Research taught me to ask what a client is deciding. Product taught me to ship the answer.",
    projects: "Each project starts with a problem someone had and ends with what changed.",
    resume: "The summary; the project stories hold the detail."
  },
  technical: {
    label: "Technical",
    about: "Discovery and product decisions, plus hands-on retrieval, routing, evaluation and prompt work.",
    experience: "Evaluation sets, routing, retrieval rules, analytics and rollout across three roles.",
    projects: "RAG and routing in production, a lead-qualification assistant, bill OCR, voice health logging and an always-on agent.",
    resume: "Product ownership and hands-on engineering, as PDFs."
  }
};
