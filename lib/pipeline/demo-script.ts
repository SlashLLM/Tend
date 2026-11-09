/**
 * Scripted 3-minute dictation for Aisha's K1 story time (PRD Appendix B "Live demo").
 * Synthetic — recorded by the team with no real children. Contains roster names on purpose
 * so the demo shows redaction ("Wei Ling" → "Child A").
 */
export const DEMO_DICTATION: { t: number; text: string; moment?: boolean }[] = [
  { t: 8_000, text: 'Aisha greets the children warmly by name as they sit on the mat and the room settles quickly.' },
  { t: 24_000, text: 'She holds up the bear book and asks what animal this is. Several children call out bear.' },
  { t: 41_000, text: 'At the picture of the bear hiding she asks why do you think the bear is hiding, and waits about four seconds.', moment: true },
  { t: 58_000, text: 'Wei Ling says because he is scared of the thunder. Aisha says good answer and moves on to the next page.' },
  { t: 77_000, text: 'Arjun raises his hand with an idea but the page is turned before he can share.' },
  { t: 96_000, text: 'She asks what the bear might do next. Two children answer; most of the group goes quiet.' },
  { t: 118_000, text: 'Aisha points to the word cave on the page and the children repeat it together.' },
  { t: 139_000, text: 'When two children push for the front spot she calmly reminds them of the sitting agreement and they settle.', moment: true },
  { t: 162_000, text: 'She ends by asking the children to tell a friend their favourite part of the story.' },
];
