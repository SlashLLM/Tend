import type { Locale } from '@/i18n/routing';

/** Coach's fixed sentences (safety replies + offline coach) in each supported language. English stays the source. */
type Phrases = {
  distress: string;
  diagnosis: string;
  empathyQuiet: string;
  empathyBehaviour: string;
  empathyTime: string;
  empathyDefault: string;
  tryThis: (code: string, name: string, step: string) => string;
  signal: (look: string) => string;
  card: (title: string, sayIt: string) => string;
  lastStep: (step: string) => string;
  closing: string;
};

export const COACH_PHRASES: Record<Locale, Phrases> = {
  en: {
    distress:
      'That sounds really hard, and it matters. You don’t have to carry it alone — please talk to your Centre Leader, or reach out to your employee support line. If you feel unsafe right now, call 995 or the Samaritans of Singapore on 1767 (24 hours). When you’re ready, I’m here to help with one small, practical step.',
    diagnosis:
      'I can’t diagnose children or suggest a condition — that needs families and qualified professionals. What I can do is help you describe what you observe, plan supportive strategies for the classroom, and prepare to talk with your Centre Leader about next steps.',
    empathyQuiet: 'Quiet moments are common, especially with open questions — it often means children are thinking.',
    empathyBehaviour: 'That’s a tricky moment, and it helps to plan it ahead.',
    empathyTime: 'Time is tight in a preschool day, so let’s keep this small.',
    empathyDefault: 'Good question — let’s make it practical.',
    tryThis: (code, name, step) => `For your goal ${code} (${name}), one thing to try: ${step}`,
    signal: (look) => `A small signal it’s working: ${look}.`,
    card: (title, sayIt) => `Your card “${title}” suggests saying: ${sayIt}`,
    lastStep: (step) => `Your latest next step was: ${step}`,
    closing: 'What is one moment tomorrow where you could try this?',
  },
  zh: {
    distress:
      '这听起来真的很不容易，你的感受很重要。你不必独自承担——请和你的中心领导谈谈，或联系员工支持热线。如果你现在感到不安全，请拨打 995，或拨打新加坡援人协会热线 1767（24 小时）。等你准备好了，我会在这里帮你迈出一个小小的、实际的步骤。',
    diagnosis:
      '我无法诊断孩子或推测任何状况——这需要家庭和专业人士共同进行。我能做的是帮助你描述你观察到的情况、规划课堂上的支持策略，并准备与你的中心领导讨论下一步。',
    empathyQuiet: '安静的时刻很常见，尤其是在提开放式问题时——这通常说明孩子们正在思考。',
    empathyBehaviour: '这确实是个棘手的时刻，提前做好计划会有帮助。',
    empathyTime: '学前教育的一天时间很紧，所以我们从小处着手。',
    empathyDefault: '好问题——我们来想想实际的做法。',
    tryThis: (code, name, step) => `针对你的目标 ${code}（${name}），可以尝试：${step}`,
    signal: (look) => `一个说明有效的小信号：${look}。`,
    card: (title, sayIt) => `你的卡片“${title}”建议这样说：${sayIt}`,
    lastStep: (step) => `你最近的下一步是：${step}`,
    closing: '明天有哪个时刻你可以尝试这样做？',
  },
  ms: {
    distress:
      'Itu kedengaran sangat sukar, dan ia penting. Anda tidak perlu menanggungnya seorang diri — sila bercakap dengan Ketua Pusat anda, atau hubungi talian sokongan pekerja anda. Jika anda berasa tidak selamat sekarang, hubungi 995 atau Samaritans of Singapore di 1767 (24 jam). Apabila anda bersedia, saya ada di sini untuk membantu dengan satu langkah kecil yang praktikal.',
    diagnosis:
      'Saya tidak boleh mendiagnosis kanak-kanak atau mencadangkan sesuatu keadaan — itu memerlukan keluarga dan profesional yang bertauliah. Apa yang boleh saya lakukan ialah membantu anda menerangkan apa yang anda perhatikan, merancang strategi sokongan di bilik darjah, dan bersedia untuk berbincang dengan Ketua Pusat anda tentang langkah seterusnya.',
    empathyQuiet: 'Saat senyap adalah biasa, terutamanya dengan soalan terbuka — ia selalunya bermakna kanak-kanak sedang berfikir.',
    empathyBehaviour: 'Itu saat yang rumit, dan ia membantu jika dirancang lebih awal.',
    empathyTime: 'Masa terhad dalam sehari di prasekolah, jadi mari kita mulakan secara kecil.',
    empathyDefault: 'Soalan yang baik — mari kita jadikannya praktikal.',
    tryThis: (code, name, step) => `Untuk matlamat anda ${code} (${name}), satu perkara untuk dicuba: ${step}`,
    signal: (look) => `Tanda kecil bahawa ia berkesan: ${look}.`,
    card: (title, sayIt) => `Kad anda “${title}” mencadangkan untuk berkata: ${sayIt}`,
    lastStep: (step) => `Langkah seterusnya anda yang terkini ialah: ${step}`,
    closing: 'Apakah satu saat esok di mana anda boleh mencuba ini?',
  },
};
