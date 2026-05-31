import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

loadLocalEnv();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const systemPrompt = `
You are DeutschLift, a warm German language tutor for beginners and intermediate learners.
Teach like a polished language learning app: short, friendly, interactive, and precise.

Rules:
- Reply mostly in English, but include German examples in every answer.
- Use simple German first, then explain grammar or vocabulary briefly.
- If the learner writes German, correct it gently with: "Better: ..." and explain why.
- End every answer with one tiny practice question or fill-in-the-blank.
- Keep answers under 150 words unless the learner asks for depth.
- Avoid claiming to be Duolingo or any other existing product.
`;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleTutorChat(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Something went wrong." });
  }
});

server.listen(port, host, () => {
  console.log(`DeutschLift is running at http://${host}:${port}`);
});

async function handleTutorChat(req, res) {
  const body = await readJson(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const cleanMessages = messages
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 1200)
    }));

  if (!cleanMessages.some((message) => message.role === "user" && message.content.trim())) {
    sendJson(res, 400, { error: "Please send a question for the tutor." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    sendJson(res, 200, {
      reply: localTutorReply(cleanMessages.at(-1)?.content || ""),
      source: "practice-fallback"
    });
    return;
  }

  const openAiResult = await askOpenAi(apiKey, cleanMessages);

  if (!openAiResult.ok && openAiResult.retryWithLocalTutor) {
    sendJson(res, 200, {
      reply: localTutorReply(cleanMessages.at(-1)?.content || ""),
      source: "practice-fallback"
    });
    return;
  }

  if (!openAiResult.ok) {
    sendJson(res, openAiResult.status, {
      error: openAiResult.error || "The AI tutor could not answer right now."
    });
    return;
  }

  const reply = extractResponseText(openAiResult.data);
  sendJson(res, 200, {
    reply:
      reply ||
      "Try this: Ich lerne Deutsch. It means, I am learning German. Your turn: Ich ___ Deutsch."
  });
}

async function askOpenAi(apiKey, cleanMessages) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          ...cleanMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        ],
        temperature: 0.45,
        max_tokens: 220
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data,
        error: data.error?.message,
        retryWithLocalTutor: true
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 200,
      error: error.message,
      retryWithLocalTutor: true
    };
  }
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(__dirname, "public", safePath));

  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  const extension = path.extname(filePath);
  const content = await readFile(filePath);

  res.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(content);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function extractResponseText(data) {
  const chatText = data.choices?.[0]?.message?.content;
  if (typeof chatText === "string") {
    return chatText.trim();
  }

  if (typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function formatConversation(messages) {
  return messages
    .map((message) => `${message.role === "user" ? "Learner" : "Tutor"}: ${message.content}`)
    .join("\n");
}

function localTutorReply(question) {
  const text = question.toLowerCase();
  const cleanQuestion = question.trim();
  const translationIntent = text.match(
    /(?:how do i say|how to say|translate|what is|what's)\s+["']?(.+?)["']?\s+(?:in german|to german|auf deutsch|\?)?$/i
  );
  const meaningIntent = text.match(
    /(?:what does|meaning of|translate)\s+["']?(.+?)["']?\s+(?:mean|in english|\?)?$/i
  );

  const phrasebook = [
    ["i am hungry", "Ich habe Hunger.", "German says I have hunger, not I am hungry."],
    ["i am thirsty", "Ich habe Durst.", "Durst means thirst."],
    ["i am tired", "Ich bin müde.", "Müde means tired."],
    ["i am happy", "Ich bin glücklich.", "Glücklich means happy."],
    ["i am learning german", "Ich lerne Deutsch.", "Lerne is the ich-form of lernen."],
    ["my name is", "Ich heiße ...", "Use Ich heiße plus your name."],
    ["nice to meet you", "Freut mich, dich kennenzulernen.", "Shorter and casual: Freut mich."],
    ["hello", "Hallo.", "You can also say Guten Tag in polite daytime situations."],
    ["hi", "Hallo.", "Hi also works casually in German."],
    ["good morning", "Guten Morgen.", "Use it in the morning."],
    ["good evening", "Guten Abend.", "Use it in the evening."],
    ["goodbye", "Auf Wiedersehen.", "Casual: Tschüss."],
    ["thank you", "Danke.", "More formal: Vielen Dank."],
    ["please", "Bitte.", "Bitte also means you are welcome."],
    ["sorry", "Entschuldigung.", "For a quick apology: Sorry also works casually."],
    ["excuse me", "Entschuldigung.", "Useful before asking a question."],
    ["yes", "Ja.", "Pronounced like ya."],
    ["no", "Nein.", "Pronounced like nine."],
    ["i don't understand", "Ich verstehe nicht.", "Nicht negates the verb here."],
    ["do you speak english", "Sprechen Sie Englisch?", "Use Sie for polite you."],
    ["can you help me", "Können Sie mir helfen?", "Mir means to me."],
    ["where is the bathroom", "Wo ist die Toilette?", "Wo ist means where is."],
    ["where is the train station", "Wo ist der Bahnhof?", "Bahnhof is masculine: der Bahnhof."],
    ["where is the airport", "Wo ist der Flughafen?", "Flughafen is masculine: der Flughafen."],
    ["where is the hotel", "Wo ist das Hotel?", "Hotel is neuter: das Hotel."],
    ["i would like a coffee", "Ich hätte gern einen Kaffee.", "Einen is used because Kaffee is masculine and the object."],
    ["i would like water", "Ich hätte gern Wasser.", "No article is needed for water in this phrase."],
    ["how much does it cost", "Wie viel kostet das?", "Das means that/it here."],
    ["i love you", "Ich liebe dich.", "Use dich for someone you know personally."],
    ["see you later", "Bis später.", "Bis means until."],
    ["good night", "Gute Nacht.", "Use it when someone is going to sleep."]
  ];

  const grammarTopics = [
    {
      keys: ["accusative", "akkusativ", "direct object"],
      lines: [
        "Accusative marks the direct object: the thing receiving the action.",
        "Example: Ich sehe den Hund. Der Hund changes to den Hund.",
        "Practice: Ich kaufe ___ Kaffee. (der/einen)"
      ]
    },
    {
      keys: ["dative", "dativ", "indirect object"],
      lines: [
        "Dative often marks the receiver or beneficiary.",
        "Example: Ich helfe dem Mann. Helfen usually takes dative.",
        "Practice: Ich gebe ___ Frau das Buch. (die/der)"
      ]
    },
    {
      keys: ["conjugate", "conjugation", "verb ending", "lernen", "gehen", "sein", "haben"],
      lines: [
        "German verbs change by person: ich lerne, du lernst, er/sie/es lernt.",
        "Two important irregular verbs: ich bin, du bist, er ist; ich habe, du hast, er hat.",
        "Practice: Fill it in: Du ___ Deutsch. (lernen)"
      ]
    },
    {
      keys: ["modal", "can", "must", "want to", "können", "müssen", "wollen"],
      lines: [
        "Modal verbs pair with an infinitive at the end.",
        "Example: Ich kann Deutsch lernen. Kann is position two, lernen goes to the end.",
        "Practice: Ich muss Wasser ___. (trinken)"
      ]
    },
    {
      keys: ["past tense", "perfect tense", "perfekt", "yesterday"],
      lines: [
        "In spoken German, the perfect tense is common: haben/sein + past participle.",
        "Example: Ich habe Kaffee getrunken. I drank coffee.",
        "Practice: Ich habe Deutsch ___. (lernen)"
      ]
    },
    {
      keys: ["negative", "negation", "nicht", "kein"],
      lines: [
        "Use nicht to negate verbs or ideas. Use kein for not a/no noun.",
        "Examples: Ich verstehe nicht. Ich habe keinen Kaffee.",
        "Practice: I have no water: Ich habe ___ Wasser."
      ]
    },
    {
      keys: ["pronunciation", "pronounce", "umlaut", "ä", "ö", "ü", "ß"],
      lines: [
        "German pronunciation is quite regular. Ä sounds like e in bed, ö is rounded, and ü is like ee with rounded lips.",
        "ß sounds like a sharp s: Straße sounds like SHTRAH-suh.",
        "Practice: Try saying: müde, schön, Straße."
      ]
    }
  ];

  const vocabularyTopics = [
    {
      keys: ["number", "count", "one", "two", "three"],
      lines: [
        "Numbers 1-10: eins, zwei, drei, vier, fünf, sechs, sieben, acht, neun, zehn.",
        "Practice: What is seven in German?"
      ]
    },
    {
      keys: ["day", "week", "monday", "today", "tomorrow"],
      lines: [
        "Days: Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag.",
        "Today is heute. Tomorrow is morgen.",
        "Practice: Fill in: Morgen ist ___."
      ]
    },
    {
      keys: ["food", "drink", "restaurant", "eat"],
      lines: [
        "Food words: das Brot, der Käse, die Suppe, der Kaffee, das Wasser.",
        "A useful phrase: Ich hätte gern das Brot.",
        "Practice: Translate: I would like water."
      ]
    },
    {
      keys: ["family", "mother", "father", "sister", "brother"],
      lines: [
        "Family words: die Mutter, der Vater, die Schwester, der Bruder, die Familie.",
        "Example: Meine Mutter lernt Deutsch.",
        "Practice: My brother: mein ___."
      ]
    },
    {
      keys: ["color", "red", "blue", "green"],
      lines: [
        "Colors: rot, blau, grün, gelb, schwarz, weiß.",
        "Example: Das Auto ist rot.",
        "Practice: The bag is blue: Die Tasche ist ___."
      ]
    }
  ];

  const phraseMatch = findPhraseMatch(text, phrasebook);
  const extractedTranslation = translationIntent?.[1]?.trim().replace(/[?.!]+$/, "");
  const extractedMeaning = meaningIntent?.[1]?.trim().replace(/[?.!]+$/, "");

  if (translationIntent && extractedTranslation) {
    const matched = findPhraseMatch(extractedTranslation.toLowerCase(), phrasebook);
    if (matched) return translationReply(matched);
    return buildUnknownTranslationReply(extractedTranslation);
  }

  if (meaningIntent && extractedMeaning) {
    const matched = findGermanMeaning(extractedMeaning, phrasebook);
    if (matched) {
      return [
        `"${matched[1]}" means: ${matched[0]}.`,
        "",
        matched[2],
        "",
        `Practice: Use it in a sentence: ${matched[1].replace(/\.+$/, "")} ...`
      ].join("\n");
    }
  }

  if (text.includes("correct") || text.includes("mistake") || looksGerman(cleanQuestion)) {
    return buildGermanSentenceFeedback(cleanQuestion);
  }

  if (phraseMatch) return translationReply(phraseMatch);

  for (const topic of grammarTopics) {
    if (topic.keys.some((key) => text.includes(key))) return topic.lines.join("\n\n");
  }

  for (const topic of vocabularyTopics) {
    if (topic.keys.some((key) => text.includes(key))) return topic.lines.join("\n\n");
  }

  if (text.includes("hungry")) {
    return [
      "You can say: Ich habe Hunger.",
      "",
      "Literally, it means: I have hunger. German often uses haben here instead of sein.",
      "",
      "Try it: Ich ___ Hunger."
    ].join("\n");
  }

  if (text.includes("word order") || text.includes("sentence order") || text.includes("position two")) {
    return [
      "German main clauses usually put the verb in position two.",
      "",
      "Example: Heute lerne ich Deutsch. Heute is position one, lerne is position two.",
      "",
      "Try it: Morgen ___ ich Kaffee."
    ].join("\n");
  }

  if (text.includes("travel") || text.includes("bahnhof") || text.includes("train")) {
    return [
      "A useful travel question is: Wo ist der Bahnhof?",
      "",
      "Wo means where, ist means is, and der Bahnhof means the train station.",
      "",
      "Practice: Wo ___ der Bahnhof?"
    ].join("\n");
  }

  if (text.includes("correct") || text.includes("mistake") || text.includes("ich bin gut")) {
    return [
      "Better: Mir geht es gut.",
      "",
      "Ich bin gut sounds like I am good at something. For how you feel, German says Mir geht es gut.",
      "",
      "Try it: Mir ___ es gut."
    ].join("\n");
  }

  if (text.includes("article") || text.includes("der") || text.includes("die") || text.includes("das")) {
    return [
      "German nouns have grammatical gender: der for masculine, die for feminine, das for neuter.",
      "",
      "Examples: der Kaffee, die Milch, das Wasser.",
      "",
      "Tiny practice: ___ Kaffee, ___ Milch, ___ Wasser."
    ].join("\n");
  }

  if (text.includes("coffee") || text.includes("cafe") || text.includes("café")) {
    return [
      "A polite cafe phrase is: Ich hätte gern einen Kaffee.",
      "",
      "Hätte gern means would like. Einen appears because Kaffee is masculine and receives the action.",
      "",
      "Your turn: Ich hätte gern ___ Tee."
    ].join("\n");
  }

  if (text.includes("hello") || text.includes("greeting") || text.includes("hi")) {
    return [
      "Useful greetings: Hallo, Guten Morgen, Guten Tag, and Guten Abend.",
      "",
      "Guten Tag is safe and polite during the day.",
      "",
      "Practice: Say good evening in German: Guten ___."
    ].join("\n");
  }

  return [
    `I understand you are asking about: "${shorten(cleanQuestion, 70)}".`,
    "",
    "A useful German-learning way to approach this is to turn it into a short sentence first.",
    "Example: Ich möchte das auf Deutsch sagen. It means: I want to say that in German.",
    "",
    "Try asking: How do I say \"I need help\" in German? Practice: Ich brauche ___."
  ].join("\n");
}

function findPhraseMatch(text, phrasebook) {
  return phrasebook.find(([english, german]) => {
    const normalizedEnglish = english.toLowerCase();
    const normalizedGerman = german.toLowerCase().replace(/[?.!]+$/, "");
    const englishRegex = new RegExp(`\\b${escapeRegExp(normalizedEnglish)}\\b`, "i");
    return (
      englishRegex.test(text) ||
      normalizedEnglish.includes(text) ||
      text.includes(normalizedGerman)
    );
  });
}

function findGermanMeaning(text, phrasebook) {
  const normalizedText = text.toLowerCase().replace(/[?.!]+$/, "");
  return phrasebook.find(([, german]) => german.toLowerCase().replace(/[?.!]+$/, "").includes(normalizedText));
}

function translationReply(match) {
  const [english, german, note] = match;
  return [
    `Say: ${german}`,
    "",
    `Meaning: ${capitalize(english)}.`,
    note,
    "",
    `Practice: Type the German phrase: ${german.replace(/[A-Za-zÄÖÜäöüß]/g, "_")}`
  ].join("\n");
}

function buildUnknownTranslationReply(phrase) {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const dictionary = {
    i: "ich",
    you: "du / Sie",
    we: "wir",
    need: "brauche",
    want: "will / möchte",
    like: "mag",
    have: "habe",
    am: "bin",
    are: "bist / sind",
    learn: "lerne",
    german: "Deutsch",
    help: "Hilfe",
    water: "Wasser",
    coffee: "Kaffee",
    food: "Essen",
    today: "heute",
    tomorrow: "morgen",
    good: "gut",
    bad: "schlecht",
    where: "wo",
    what: "was",
    why: "warum",
    how: "wie"
  };
  const knownWords = words.map((word) => dictionary[word]).filter(Boolean);

  if (knownWords.length) {
    return [
      `For "${phrase}", I can build part of it: ${knownWords.join(" ")}.`,
      "",
      "To make it natural German, we need the full context and verb form.",
      "Useful pattern: Ich möchte ... means I would like to ...",
      "",
      "Try a shorter phrase, like: How do I say \"I need help\" in German?"
    ].join("\n");
  }

  return [
    `I do not have a memorized phrase for "${phrase}" in local practice mode.`,
    "",
    "But I can still help if you make it shorter: ask for one sentence, one word, or one grammar point.",
    "Example: How do I say \"Where is the train station?\" in German?",
    "",
    "Practice: Wo ist der ___?"
  ].join("\n");
}

function looksGerman(text) {
  return /[äöüß]/i.test(text) || /\b(ich|du|er|sie|wir|ihr|bin|bist|ist|sind|habe|haben|nicht|kein|der|die|das|ein|eine)\b/i.test(text);
}

function buildGermanSentenceFeedback(sentence) {
  const lower = sentence.toLowerCase();

  if (lower.includes("ich bin gut")) {
    return [
      "Better: Mir geht es gut.",
      "",
      "Ich bin gut means I am good/skilled. For how you feel, use Mir geht es gut.",
      "",
      "Practice: Mir ___ es gut."
    ].join("\n");
  }

  if (lower.includes("ich habe hungrig")) {
    return [
      "Better: Ich habe Hunger.",
      "",
      "Hungrig is an adjective, but the natural phrase is Hunger haben.",
      "",
      "Practice: Ich habe ___."
    ].join("\n");
  }

  if (lower.includes("ich bin") && lower.includes("jahre")) {
    return [
      "Better: Ich bin ... Jahre alt.",
      "",
      "For age, German uses Jahre alt after the number.",
      "",
      "Practice: Ich bin 20 Jahre ___."
    ].join("\n");
  }

  return [
    "Nice, you wrote German. I would check three things: verb position, article, and ending.",
    "",
    `Your sentence: ${sentence}`,
    "A simple main-clause pattern is: subject + verb + rest. Example: Ich lerne Deutsch.",
    "",
    "Try sending the sentence with: Correct this: ..."
  ].join("\n");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shorten(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
