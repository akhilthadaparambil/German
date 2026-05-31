const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatLog = document.querySelector("#chatLog");
const resetChat = document.querySelector("#resetChat");
const exerciseInput = document.querySelector("#exerciseInput");
const exerciseFeedback = document.querySelector("#exerciseFeedback");
const checkAnswer = document.querySelector("#checkAnswer");
const promptButtons = document.querySelectorAll("[data-prompt]");
const lessonButtons = document.querySelectorAll("[data-lesson]");
const startA1Lesson = document.querySelector("#startA1Lesson");
const openArticleQuiz = document.querySelector("#openArticleQuiz");
const articleQuiz = document.querySelector("#articleQuiz");
const articleChoices = document.querySelector("#articleChoices");
const nextQuizQuestion = document.querySelector("#nextQuizQuestion");
const quizProgress = document.querySelector("#quizProgress");
const quizScore = document.querySelector("#quizScore");
const quizMeter = document.querySelector("#quizMeter");
const quizMeaning = document.querySelector("#quizMeaning");
const quizBlank = document.querySelector("#quizBlank");
const quizNoun = document.querySelector("#quizNoun");
const quizFeedback = document.querySelector("#quizFeedback");
const lessonTitle = document.querySelector("#lessonTitle");
const lessonPhrase = document.querySelector("#lessonPhrase");
const lessonTranslation = document.querySelector("#lessonTranslation");
const exerciseQuestion = document.querySelector("#exerciseQuestion");

let messages = [];
let activeLesson = "cafe";
let quizIndex = 0;
let quizScoreCount = 0;
let answeredCurrentQuestion = false;
let quizFinished = false;

const lessons = {
  cafe: {
    title: "Order Like A Local",
    phrase: "Ich hätte gern einen Kaffee.",
    translation: "I would like a coffee.",
    question: "Fill the gap: Ich ___ gern Wasser.",
    answers: ["hätte", "haette"],
    correct: "Correct. Ich hätte gern Wasser. Polite and useful.",
    incorrect: "Almost. Use hätte: Ich hätte gern Wasser.",
    prompt: "Start a short German lesson about ordering coffee."
  },
  "word-order": {
    title: "Build A Sentence",
    phrase: "Heute lerne ich Deutsch.",
    translation: "Today I am learning German.",
    question: "Put the verb in position two: Heute ___ ich Deutsch.",
    answers: ["lerne"],
    correct: "Correct. In main clauses, the verb often sits in position two.",
    incorrect: "Try lerne: Heute lerne ich Deutsch.",
    prompt: "Teach me German sentence order with simple examples."
  },
  travel: {
    title: "Travel Phrases",
    phrase: "Wo ist der Bahnhof?",
    translation: "Where is the train station?",
    question: "Fill the gap: Wo ___ der Bahnhof?",
    answers: ["ist"],
    correct: "Correct. Wo ist der Bahnhof? is a travel essential.",
    incorrect: "Use ist: Wo ist der Bahnhof?",
    prompt: "Practice German travel phrases with me."
  },
  corrections: {
    title: "Fix My German",
    phrase: "Mir geht es gut.",
    translation: "I am doing well.",
    question: "Correct this idea: Ich bin gut. Better: Mir ___ es gut.",
    answers: ["geht"],
    correct: "Correct. Mir geht es gut is the natural phrase for how you feel.",
    incorrect: "Use geht: Mir geht es gut.",
    prompt: "Correct my German sentence and explain the mistake: Ich bin gut."
  }
};

const articleQuestions = [
  {
    noun: "Kaffee",
    meaning: "coffee",
    article: "der",
    note: "Kaffee is masculine, so we say der Kaffee."
  },
  {
    noun: "Milch",
    meaning: "milk",
    article: "die",
    note: "Milch is feminine, so we say die Milch."
  },
  {
    noun: "Wasser",
    meaning: "water",
    article: "das",
    note: "Wasser is neuter, so we say das Wasser."
  },
  {
    noun: "Bahnhof",
    meaning: "train station",
    article: "der",
    note: "Bahnhof is masculine, so we say der Bahnhof."
  },
  {
    noun: "Toilette",
    meaning: "bathroom",
    article: "die",
    note: "Toilette is feminine, so we say die Toilette."
  },
  {
    noun: "Hotel",
    meaning: "hotel",
    article: "das",
    note: "Hotel is neuter, so we say das Hotel."
  }
];

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = "";
    await askTutor(question);
  });
}

resetChat?.addEventListener("click", () => {
  if (!chatLog) return;
  messages = [];
  chatLog.innerHTML = "";
  appendMessage("tutor", "Hallo! Fresh start. What should we practice first?");
});

checkAnswer?.addEventListener("click", () => {
  const answer = exerciseInput.value.trim().toLowerCase();
  const lesson = lessons[activeLesson];
  if (lesson.answers.includes(answer)) {
    exerciseFeedback.textContent = lesson.correct;
    exerciseFeedback.style.color = "#12724a";
    return;
  }

  exerciseFeedback.textContent = lesson.incorrect;
  exerciseFeedback.style.color = "#9f3430";
});

promptButtons.forEach((button) => {
  button.addEventListener("click", () => askTutor(button.dataset.prompt));
});

startA1Lesson?.addEventListener("click", () => {
  if (articleQuiz) articleQuiz.hidden = true;
  setActiveLesson("cafe");
  document.querySelector(".learning-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  askTutor("Start my A1 German lesson. Teach me greetings, cafe basics, and one tiny practice question.");
});

openArticleQuiz?.addEventListener("click", () => {
  articleQuiz.hidden = false;
  articleQuiz.scrollIntoView({ behavior: "smooth", block: "center" });
  resetQuiz();
});

lessonButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveLesson(button.dataset.lesson);
    askTutor(lessons[activeLesson].prompt);
  });
});

articleChoices?.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-article]");
  if (!choice || answeredCurrentQuestion) return;

  answerQuiz(choice.dataset.article);
});

nextQuizQuestion?.addEventListener("click", () => {
  if (quizFinished) {
    resetQuiz();
    return;
  }

  if (!answeredCurrentQuestion) {
    quizFeedback.textContent = "Pick der, die, or das before moving on.";
    quizFeedback.className = "quiz-feedback error";
    return;
  }

  if (quizIndex === articleQuestions.length - 1) {
    showQuizResults();
    return;
  }

  quizIndex += 1;
  renderQuizQuestion();
});

if (articleQuiz && !articleQuiz.hidden) {
  resetQuiz();
}

if (chatLog && location.pathname.endsWith("/a1.html")) {
  askTutor("Start my A1 German lesson. Teach me greetings, cafe basics, and one tiny practice question.");
}

async function askTutor(question) {
  if (!chatLog || !chatForm || !chatInput) return;
  appendMessage("user", question);
  messages.push({ role: "user", content: question });
  setChatBusy(true);

  const loading = appendMessage("tutor", "Thinking...");
  loading.classList.add("loading");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The tutor could not answer.");
    }

    loading.remove();
    appendMessage("tutor", data.reply);
    messages.push({ role: "assistant", content: data.reply });
  } catch (error) {
    loading.remove();
    appendMessage(
      "tutor",
      `${error.message}\n\nTry the mini lesson while the AI connection is being checked.`
    );
  } finally {
    setChatBusy(false);
  }
}

function setActiveLesson(lessonId) {
  if (!lessonTitle || !lessonPhrase || !lessonTranslation || !exerciseQuestion || !exerciseInput || !exerciseFeedback) {
    return;
  }

  const lesson = lessons[lessonId] || lessons.cafe;
  activeLesson = lessonId in lessons ? lessonId : "cafe";

  lessonButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lesson === activeLesson);
  });

  lessonTitle.textContent = lesson.title;
  lessonPhrase.textContent = lesson.phrase;
  lessonTranslation.textContent = lesson.translation;
  exerciseQuestion.textContent = lesson.question;
  exerciseInput.value = "";
  exerciseFeedback.textContent = "";
}

function resetQuiz() {
  if (!articleChoices || !quizMeaning || !nextQuizQuestion) return;

  quizIndex = 0;
  quizScoreCount = 0;
  quizFinished = false;
  articleChoices.hidden = false;
  quizMeaning.hidden = false;
  nextQuizQuestion.textContent = "Next";
  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (!quizMeaning || !quizBlank || !quizNoun || !quizProgress || !quizScore || !quizFeedback || !quizMeter) {
    return;
  }

  const question = articleQuestions[quizIndex];
  answeredCurrentQuestion = false;
  quizFinished = false;
  quizMeaning.textContent = question.meaning;
  quizMeaning.hidden = false;
  quizBlank.textContent = "___";
  quizNoun.textContent = question.noun;
  quizProgress.textContent = `${quizIndex + 1} / ${articleQuestions.length}`;
  quizScore.textContent = `${quizScoreCount * 10} XP`;
  quizFeedback.textContent = "Choose the article to keep your streak alive.";
  quizFeedback.className = "quiz-feedback";
  quizMeter.style.width = `${(quizIndex / articleQuestions.length) * 100}%`;
  nextQuizQuestion.textContent = quizIndex === articleQuestions.length - 1 ? "Finish" : "Next";
  articleChoices.hidden = false;

  articleChoices.querySelectorAll("button").forEach((button) => {
    button.disabled = false;
    button.className = "";
  });
}

function answerQuiz(selectedArticle) {
  const question = articleQuestions[quizIndex];
  const isCorrect = selectedArticle === question.article;
  answeredCurrentQuestion = true;
  quizBlank.textContent = question.article;

  articleChoices.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
    if (button.dataset.article === question.article) button.classList.add("correct");
    if (button.dataset.article === selectedArticle && !isCorrect) button.classList.add("wrong");
  });

  if (isCorrect) {
    quizScoreCount += 1;
    quizFeedback.textContent = `Nice. ${question.note}`;
    quizFeedback.classList.add("success");
  } else {
    quizFeedback.textContent = `Almost. ${question.note}`;
    quizFeedback.classList.add("error");
  }

  quizScore.textContent = `${quizScoreCount * 10} XP`;
  quizMeter.style.width = `${((quizIndex + 1) / articleQuestions.length) * 100}%`;
}

function showQuizResults() {
  quizFinished = true;
  answeredCurrentQuestion = false;
  const total = articleQuestions.length;
  const percent = Math.round((quizScoreCount / total) * 100);
  const xp = quizScoreCount * 10;
  const mark =
    percent >= 90 ? "A+" : percent >= 75 ? "A" : percent >= 60 ? "B" : percent >= 45 ? "C" : "Practice";

  quizMeaning.hidden = true;
  quizBlank.textContent = `${percent}%`;
  quizNoun.textContent = "complete";
  quizProgress.textContent = "Done";
  quizScore.textContent = `${xp} XP`;
  quizFeedback.textContent = `Final score: ${quizScoreCount}/${total}. Mark: ${mark}. Points earned: ${xp} XP.`;
  quizFeedback.className = percent >= 60 ? "quiz-feedback success" : "quiz-feedback error";
  quizMeter.style.width = "100%";
  articleChoices.hidden = true;
  nextQuizQuestion.textContent = "Play Again";
}

function setChatBusy(isBusy) {
  chatInput.disabled = isBusy;
  chatForm.querySelector("button").disabled = isBusy;
}

function appendMessage(role, text) {
  const message = document.createElement("article");
  message.className = `message ${role}`;

  const label = document.createElement("strong");
  label.textContent = role === "user" ? "You" : "DeutschLift";

  const body = document.createElement("p");
  body.textContent = text;

  message.append(label, body);
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}
