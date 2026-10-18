import { parseWhisperOutput } from '../src/main/pipeline/whisper'

export interface WindowInput {
  pipelineVersion: string
  inputManifestSha256: string
  inputStartFrame: number
  inputEndFrame: number
}
interface Evidence {
  modelVersion: string
  speakers: {speakerId:string; embedding:number[]; voicedFrames:number}[]
  segments: {start:number; end:number; speaker:string}[]
}
export const validWindow = (w:WindowInput) => typeof w.pipelineVersion === 'string'
  && w.pipelineVersion.trim().length > 0 && w.pipelineVersion.length <= 64
  && /^[0-9a-f]{64}$/.test(w.inputManifestSha256)
  && Number.isSafeInteger(w.inputStartFrame) && Number.isSafeInteger(w.inputEndFrame)
  && w.inputStartFrame >= 0 && w.inputEndFrame > w.inputStartFrame && w.inputEndFrame <= 115200000
  && w.inputEndFrame-w.inputStartFrame <= 960000

export const assembleWindowResult = (raw:Buffer, evidence:Evidence, window:WindowInput) => {
  const frames = window.inputEndFrame-window.inputStartFrame
  if (!validWindow(window) || !evidence.modelVersion || !Array.isArray(evidence.speakers)
      || !Array.isArray(evidence.segments) || evidence.speakers.length > 64) throw new Error('INVALID_RESULT')
  const ids = new Set<string>()
  const speakers = evidence.speakers.map(s => ({...s}))
  for (const s of speakers) {
    if (!s.speakerId || ids.has(s.speakerId) || !Array.isArray(s.embedding)
        || (s.embedding.length !== 0 && s.embedding.length !== 512)
        || s.embedding.some(x => !Number.isFinite(x)) || !Number.isSafeInteger(s.voicedFrames)
        || s.voicedFrames < 0 || s.voicedFrames > frames) throw new Error('INVALID_RESULT')
    ids.add(s.speakerId)
  }
  for (const s of evidence.segments) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start
        || Math.round(s.end*16000)>frames || !ids.has(s.speaker)) throw new Error('INVALID_RESULT')
  }
  const tokens = parseWhisperOutput(raw).flatMap(s => {
    if (s.text.trim() && !s.words?.length) throw new Error('WORD_TIMESTAMPS_REQUIRED')
    return (s.words??[]).flatMap(w => {
      const rawStart=Math.round(w.start*16000), rawEnd=Math.round(w.end*16000)
      const startFrame=Math.max(0,rawStart), endFrame=Math.min(frames,rawEnd)
      if (!Number.isSafeInteger(rawStart)||!Number.isSafeInteger(rawEnd)||rawStart<0||rawEnd<0||rawEnd<rawStart)
        throw new Error('INVALID_RESULT')
      // Whisper may emit zero-duration words wholly after the actual WAV end.
      if (rawStart>=frames||rawEnd<=0) return []
      if (rawEnd===rawStart) throw new Error('INVALID_RESULT')
      if (endFrame<=startFrame) return []
      const ranked=evidence.segments.map(s=>({speaker:s.speaker,
        overlap:Math.max(0,Math.min(w.end,s.end)-Math.max(w.start,s.start))}))
        .sort((a,b)=>b.overlap-a.overlap||a.speaker.localeCompare(b.speaker))
      const speakerId=ranked[0]?.overlap>0?ranked[0].speaker:'unknown'
      if(speakerId==='unknown'&&!ids.has(speakerId)) {
        ids.add(speakerId);speakers.push({speakerId,embedding:[],voicedFrames:0})
      }
      return [{startFrame,endFrame,text:w.text,speakerId}]
    })
  }).sort((a,b)=>a.startFrame-b.startFrame||a.endFrame-b.endFrame)
  const utterances=tokens.map((t,ord)=>({ord,speakerLabel:t.speakerId,
    startSec:t.startFrame/16000,endSec:t.endFrame/16000,text:t.text}))
  return {schemaVersion:1,rawWhisperJson:raw.toString('utf8'),utterances,
    window:{schemaVersion:1,...window,modelVersion:evidence.modelVersion,tokens,speakers}}
}
