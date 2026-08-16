'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ContentItem = {
  id: string;
  title?: string;
  type?: string;
  contentType?: string;
  published?: boolean;
  isPublished?: boolean;
  createdAt?: string;
};

type Announcement = {
  id: string;
  title?: string;
  body?: string;
  createdAt?: string;
};

type Submission = { id: string; status: string; score?: string | number | null; feedback?: string | null; attachmentKey?: string | null; attachmentName?: string | null; content?: { id: string; title: string; contentType: string } };
type ProgressItem = { id: string; progressPct: number; completedAt?: string | null; content?: { id: string; title: string; contentType: string } };
type DiscussionPost = { id: string; body: string; author?: { email?: string }; replies?: Array<{ id: string; body: string; author?: { email?: string } }> };
type QuizQuestion = { id: string; prompt: string; questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'; options?: string[] | null; points: number };
type QuizAttempt = { id: string; status: string; score?: string | number | null; maxScore?: string | number | null; feedback?: string | null; content?: { id: string; title: string } };

export default function LmsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = ['SUPER_ADMIN','VC','REGISTRAR','STAFF'].includes(user?.primaryRole ?? '');
  const isStudent = user?.primaryRole === 'STUDENT';
  const { data: enrolledCourses = [] } = useQuery({
    queryKey: ['lms', 'my-courses'],
    queryFn: () => apiClient.get<Array<{ id: string; course: { code: string; title: string }; semesterModel?: { name: string; academicYear: string } }>>('/lms/my-courses'),
    enabled: isStudent,
  });
  const [courseOfferingId, setCourseOfferingId] = useState('');
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [discussions, setDiscussions] = useState<DiscussionPost[]>([]);
  const [responseText, setResponseText] = useState('');
  const [discussionBody, setDiscussionBody] = useState('');
  const [selectedInteractionContent, setSelectedInteractionContent] = useState('');
  const [markingSubmissions, setMarkingSubmissions] = useState<Submission[]>([]);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [activeQuizAttempt, setActiveQuizAttempt] = useState<QuizAttempt | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string | string[]>>({});
  const [quizQuestionPrompt, setQuizQuestionPrompt] = useState('');
  const [quizQuestionType, setQuizQuestionType] = useState('SINGLE_CHOICE');
  const [quizQuestionOptions, setQuizQuestionOptions] = useState('');
  const [quizCorrectAnswer, setQuizCorrectAnswer] = useState('');
  const [quizQuestionPoints, setQuizQuestionPoints] = useState('1');
  const [attachmentKey, setAttachmentKey] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentMime, setAttachmentMime] = useState('');
  const [attachmentSize, setAttachmentSize] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('LECTURE');
  const [body, setBody] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const canLoad = courseOfferingId.trim().length > 0;

  const refresh = async () => {
    if (!canLoad) return;
    setLoading(true);
    setError('');
    try {
      const [c, a, d] = await Promise.all([
        apiClient.get<ContentItem[]>(`/lms/content/${encodeURIComponent(courseOfferingId.trim())}`),
        apiClient.get<Announcement[]>(`/lms/announcements/${encodeURIComponent(courseOfferingId.trim())}`),
        apiClient.get<DiscussionPost[]>(`/lms/discussions/${encodeURIComponent(courseOfferingId.trim())}`),
      ]);
      setContents(c ?? []);
      setAnnouncements(a ?? []);
      setDiscussions(d ?? []);
      if (isStudent) {
        const [s, p, q] = await Promise.all([
          apiClient.get<Submission[]>(`/lms/submissions/my?courseOfferingId=${encodeURIComponent(courseOfferingId.trim())}`),
          apiClient.get<ProgressItem[]>(`/lms/progress/${encodeURIComponent(courseOfferingId.trim())}`),
          apiClient.get<QuizAttempt[]>(`/lms/quizzes/attempts/my?courseOfferingId=${encodeURIComponent(courseOfferingId.trim())}`),
        ]);
        setSubmissions(s ?? []);
        setProgress(p ?? []);
        setQuizAttempts(q ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load course learning content.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [courseOfferingId]);

  const publishedCount = useMemo(() => contents.filter((x) => x.published ?? x.isPublished).length, [contents]);

  const submitAssignment = async () => {
    if (!selectedInteractionContent || (!responseText.trim() && !attachmentKey.trim() && !attachmentFile)) { setError('Select assignment content and provide a response or attachment.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      let key = attachmentKey.trim();
      let name = attachmentName.trim();
      let mime = attachmentMime.trim();
      let size = attachmentSize ? Number(attachmentSize) : undefined;
      if (attachmentFile) {
        if (attachmentFile.size > 10 * 1024 * 1024) throw new Error('Attachments must be 10 MiB or smaller.');
        const presigned = await apiClient.post<{ key: string; url: string; method: 'POST'; fields: Record<string, string>; maxSizeBytes: number }>('/lms/submissions/attachments/presign', { contentId: selectedInteractionContent, attachmentName: attachmentFile.name, attachmentMime: attachmentFile.type || 'application/octet-stream', attachmentSize: attachmentFile.size });
        const form = new FormData();
        Object.entries(presigned.fields).forEach(([field, value]) => form.append(field, value));
        form.append('file', attachmentFile);
        const upload = await fetch(presigned.url, { method: presigned.method, body: form });
        if (!upload.ok) throw new Error('Private attachment upload failed.');
        key = presigned.key; name = attachmentFile.name; mime = attachmentFile.type || 'application/octet-stream'; size = attachmentFile.size;
      }
      await apiClient.post('/lms/submissions', { contentId: selectedInteractionContent, responseText: responseText.trim() || undefined, attachmentKey: key || undefined, attachmentName: name || undefined, attachmentMime: mime || undefined, attachmentSize: size });
      setResponseText(''); setAttachmentKey(''); setAttachmentName(''); setAttachmentMime(''); setAttachmentSize(''); setAttachmentFile(null); setMessage('Submission saved and marked submitted.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit the assignment.'); }
    finally { setSaving(false); }
  };

  const downloadAttachment = async (submissionId: string) => {
    setSaving(true); setError('');
    try { const signed = await apiClient.get<{ url: string }>(`/lms/submissions/${submissionId}/attachment`); window.open(signed.url, '_blank', 'noopener,noreferrer'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to authorize attachment download.'); }
    finally { setSaving(false); }
  };

  const loadQuiz = async (contentId: string) => {
    setSelectedInteractionContent(contentId); setActiveQuizAttempt(null); setQuizAnswers({});
    if (!contentId) { setQuizQuestions([]); return; }
    try { setQuizQuestions(await apiClient.get<QuizQuestion[]>(`/lms/quizzes/${contentId}/questions`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load quiz questions.'); }
  };

  const startQuiz = async () => {
    if (!selectedInteractionContent) return;
    setSaving(true); setError('');
    try { setActiveQuizAttempt(await apiClient.post<QuizAttempt>(`/lms/quizzes/${selectedInteractionContent}/attempts`, {})); setMessage('Quiz attempt started.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to start the quiz.'); }
    finally { setSaving(false); }
  };

  const submitQuiz = async () => {
    if (!activeQuizAttempt) return;
    setSaving(true); setError('');
    try {
      const answers = Object.fromEntries(Object.entries(quizAnswers).map(([id, answer]) => [id, Array.isArray(answer) ? answer : (quizQuestions.find((q) => q.id === id)?.questionType === 'MULTIPLE_CHOICE' ? answer.split(',').map((x) => x.trim()).filter(Boolean) : answer)]));
      const result = await apiClient.post<QuizAttempt>(`/lms/quizzes/attempts/${activeQuizAttempt.id}/submit`, { answers });
      setActiveQuizAttempt(result); setMessage(result.status === 'GRADED' ? 'Quiz submitted and graded automatically.' : 'Quiz submitted for manual grading.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit the quiz.'); }
    finally { setSaving(false); }
  };

  const addQuizQuestion = async () => {
    if (!selectedInteractionContent || !quizQuestionPrompt.trim()) { setError('Select quiz content and enter a question prompt.'); return; }
    setSaving(true); setError('');
    try { await apiClient.post('/lms/quizzes/questions', { contentId: selectedInteractionContent, prompt: quizQuestionPrompt.trim(), questionType: quizQuestionType, options: quizQuestionOptions.split(',').map((x) => x.trim()).filter(Boolean), correctAnswer: quizCorrectAnswer.trim() || undefined, points: Number(quizQuestionPoints) }); setQuizQuestionPrompt(''); setQuizQuestionOptions(''); setQuizCorrectAnswer(''); setMessage('Quiz question added.'); await loadQuiz(selectedInteractionContent); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to add the quiz question.'); }
    finally { setSaving(false); }
  };

  const markComplete = async (contentId: string) => {
    setSaving(true); setError('');
    try { await apiClient.patch(`/lms/progress/${contentId}`, { progressPct: 100 }); setMessage('Content marked complete.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update progress.'); }
    finally { setSaving(false); }
  };

  const postDiscussion = async () => {
    if (!discussionBody.trim()) { setError('Write a discussion message first.'); return; }
    setSaving(true); setError(''); setMessage('');
    try { await apiClient.post('/lms/discussions', { courseOfferingId: courseOfferingId.trim(), contentId: selectedInteractionContent || undefined, body: discussionBody.trim() }); setDiscussionBody(''); setMessage('Discussion post published.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to publish the discussion post.'); }
    finally { setSaving(false); }
  };

  const loadMarking = async (contentId: string) => {
    setSelectedInteractionContent(contentId);
    if (!contentId || isStudent) return;
    try { setMarkingSubmissions(await apiClient.get<Submission[]>(`/lms/submissions/content/${contentId}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load submissions for marking.'); }
  };

  const gradeSubmission = async (id: string, score: number) => {
    setSaving(true); setError('');
    try { await apiClient.patch(`/lms/submissions/${id}/grade`, { score }); setMessage('Submission graded.'); if (selectedInteractionContent) await loadMarking(selectedInteractionContent); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to grade the submission.'); }
    finally { setSaving(false); }
  };

  const addContent = async () => {
    if (!canLoad || !title.trim()) {
      setError('Enter a Course Offering ID and content title.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await apiClient.post('/lms/content', {
        courseOfferingId: courseOfferingId.trim(),
        title: title.trim(),
        contentType,
        body: body.trim() || undefined,
      });
      setTitle(''); setBody('');
      setMessage('Learning content created. Publish it when it is ready for students.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create learning content.');
    } finally { setSaving(false); }
  };

  const publish = async (id: string) => {
    setSaving(true); setError(''); setMessage('');
    try {
      await apiClient.patch(`/lms/content/${id}/publish`, {});
      setMessage('Content published successfully.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish content.');
    } finally { setSaving(false); }
  };

  const addAnnouncement = async () => {
    if (!canLoad || !announcementTitle.trim() || !announcementBody.trim()) {
      setError('Course Offering ID, announcement title and message are required.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      await apiClient.post('/lms/announcements', {
        courseOfferingId: courseOfferingId.trim(),
        title: announcementTitle.trim(),
        body: announcementBody.trim(),
      });
      setAnnouncementTitle(''); setAnnouncementBody('');
      setMessage('Announcement posted.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to post announcement.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Learning</h2>
        <p className="text-sm text-muted-foreground">
          Deliver course materials and announcements from one controlled workspace.
          Publishing is deliberate so unfinished material never becomes visible accidentally.
        </p>
      </header>

      {(error || message) && (
        <div
          role={error ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}
        >
          {error || message}
        </div>
      )}

      <Card>
          <CardHeader><CardTitle className="text-base">Course context</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          {isStudent ? <select aria-label="Enrolled course offering" className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={courseOfferingId} onChange={(e) => setCourseOfferingId(e.target.value)}><option value="">Select an enrolled course</option>{enrolledCourses.map((course) => <option key={course.id} value={course.id}>{course.course.code} · {course.course.title} · {course.semesterModel?.academicYear ?? ''}</option>)}</select> : <Input value={courseOfferingId} onChange={(e) => setCourseOfferingId(e.target.value)} placeholder="Course Offering ID" aria-label="Course Offering ID" />}
          <Button variant="outline" onClick={() => void refresh()} disabled={!canLoad || loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </CardContent>
      </Card>

      {!canLoad ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Select a course offering to begin.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Students should use their assigned course offering; staff should only manage courses within their authorization scope.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Content items</p><p className="mt-1 text-2xl font-semibold">{contents.length}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Published</p><p className="mt-1 text-2xl font-semibold">{publishedCount}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Announcements</p><p className="mt-1 text-2xl font-semibold">{announcements.length}</p></CardContent></Card>
          </div>

          {canManage && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Add learning content</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    <option>LECTURE</option><option>READING</option><option>VIDEO</option><option>RESOURCE</option><option>OTHER</option>
                  </select>
                  <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional instructions or content summary" />
                  <Button onClick={() => void addContent()} disabled={saving}>Create content</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Post announcement</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Announcement title" />
                  <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={announcementBody} onChange={(e) => setAnnouncementBody(e.target.value)} placeholder="Message for enrolled students" />
                  <Button onClick={() => void addAnnouncement()} disabled={saving}>Post announcement</Button>
                </CardContent>
              </Card>
            </div>
          )}

          {isStudent && <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Assignments and progress</CardTitle></CardHeader><CardContent className="space-y-3">
              <select aria-label="Assignment content" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedInteractionContent} onChange={(e) => setSelectedInteractionContent(e.target.value)}><option value="">Select assignment or quiz</option>{contents.filter((item) => ['ASSIGNMENT', 'QUIZ'].includes(item.contentType ?? item.type ?? '')).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Write your response" />
              <Input type="file" accept="application/pdf,text/plain,image/jpeg,image/png,application/zip" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} aria-label="Private assignment attachment" />
              <Input value={attachmentKey} onChange={(e) => setAttachmentKey(e.target.value)} placeholder="Existing opaque attachment key (optional)" />
              <div className="grid gap-2 sm:grid-cols-3"><Input value={attachmentName} onChange={(e) => setAttachmentName(e.target.value)} placeholder="File name" /><Input value={attachmentMime} onChange={(e) => setAttachmentMime(e.target.value)} placeholder="MIME type" /><Input type="number" min={1} max={10485760} value={attachmentSize} onChange={(e) => setAttachmentSize(e.target.value)} placeholder="Size bytes" /></div>
              <p className="text-xs text-muted-foreground">Files are uploaded directly to private object storage through a short-lived presigned URL. Public URLs and path traversal are rejected.</p>
              <Button onClick={() => void submitAssignment()} disabled={saving || !selectedInteractionContent}>Submit assignment</Button>
              <div className="space-y-2">{submissions.map((submission) => <div key={submission.id} className="rounded border p-2 text-sm"><div className="flex justify-between gap-2"><span>{submission.content?.title ?? 'Submission'}</span><span>{submission.status}{submission.score != null ? ` · ${submission.score}/100` : ''}</span></div>{submission.feedback && <p className="mt-1 text-xs text-muted-foreground">{submission.feedback}</p>}{submission.attachmentKey && <Button size="sm" variant="outline" onClick={() => void downloadAttachment(submission.id)} disabled={saving}>Download {submission.attachmentName ?? 'attachment'}</Button>}</div>)}</div>
              <div className="border-t pt-3">{contents.slice(0, 8).map((item) => { const completed = progress.some((entry) => entry.content?.id === item.id && entry.completedAt); return <div key={item.id} className="flex items-center justify-between py-1 text-sm"><span>{item.title}</span><Button size="sm" variant="outline" disabled={saving || completed} onClick={() => void markComplete(item.id)}>{completed ? 'Complete' : 'Mark complete'}</Button></div>; })}</div>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Quiz assessment</CardTitle></CardHeader><CardContent className="space-y-3"><select aria-label="Quiz content" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={quizQuestions.length ? selectedInteractionContent : ''} onChange={(e) => void loadQuiz(e.target.value)}><option value="">Select quiz content</option>{contents.filter((item) => (item.contentType ?? item.type) === 'QUIZ').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{quizQuestions.length > 0 && <><div className="flex justify-between gap-2 text-sm"><span>{quizQuestions.length} question(s)</span><Button size="sm" onClick={() => void startQuiz()} disabled={saving || Boolean(activeQuizAttempt)}>Start attempt</Button></div>{activeQuizAttempt && <div className="space-y-3 rounded border p-3">{quizQuestions.map((question, index) => <div key={question.id} className="space-y-1"><label className="text-sm font-medium">{index + 1}. {question.prompt} <span className="text-xs text-muted-foreground">({question.points} point(s))</span></label>{question.options?.length ? <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={String(quizAnswers[question.id] ?? '')} onChange={(e) => setQuizAnswers((current) => ({ ...current, [question.id]: e.target.value }))}><option value="">Select an answer</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <Input value={String(quizAnswers[question.id] ?? '')} onChange={(e) => setQuizAnswers((current) => ({ ...current, [question.id]: e.target.value }))} placeholder="Your answer" />}</div>)}<Button onClick={() => void submitQuiz()} disabled={saving}>Submit quiz</Button></div>}</>}{quizAttempts.filter((attempt) => attempt.content?.id === selectedInteractionContent).map((attempt) => <div key={attempt.id} className="rounded border p-2 text-sm"><span>{attempt.status}</span>{attempt.score != null && <span> · {attempt.score}/{attempt.maxScore}</span>}{attempt.feedback && <p className="mt-1 text-xs text-muted-foreground">{attempt.feedback}</p>}</div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Course discussion</CardTitle></CardHeader><CardContent className="space-y-3"><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={discussionBody} onChange={(e) => setDiscussionBody(e.target.value)} placeholder="Ask a question or contribute to the discussion" /><Button onClick={() => void postDiscussion()} disabled={saving}>Post to discussion</Button><div className="space-y-3">{discussions.map((post) => <article key={post.id} className="rounded border p-3"><p className="text-xs text-muted-foreground">{post.author?.email ?? 'Participant'}</p><p className="mt-1 whitespace-pre-wrap text-sm">{post.body}</p>{post.replies?.map((reply) => <p key={reply.id} className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">{reply.body}</p>)}</article>)}</div></CardContent></Card>
          </div>}

          {canManage && <Card><CardHeader><CardTitle className="text-base">Quiz authoring and marking</CardTitle></CardHeader><CardContent className="space-y-3"><select aria-label="Quiz to author" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedInteractionContent} onChange={(e) => void loadQuiz(e.target.value)}><option value="">Select quiz content</option>{contents.filter((item) => (item.contentType ?? item.type) === 'QUIZ').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Input value={quizQuestionPrompt} onChange={(e) => setQuizQuestionPrompt(e.target.value)} placeholder="Question prompt" /><div className="grid gap-2 sm:grid-cols-2"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={quizQuestionType} onChange={(e) => setQuizQuestionType(e.target.value)}><option>SINGLE_CHOICE</option><option>MULTIPLE_CHOICE</option><option>TRUE_FALSE</option><option>SHORT_ANSWER</option></select><Input type="number" min={1} max={100} value={quizQuestionPoints} onChange={(e) => setQuizQuestionPoints(e.target.value)} placeholder="Points" /></div><Input value={quizQuestionOptions} onChange={(e) => setQuizQuestionOptions(e.target.value)} placeholder="Options, comma separated" /><Input value={quizCorrectAnswer} onChange={(e) => setQuizCorrectAnswer(e.target.value)} placeholder="Correct answer (JSON array for multiple choice)" /><Button onClick={() => void addQuizQuestion()} disabled={saving || !selectedInteractionContent}>Add question</Button><div className="space-y-2">{quizQuestions.map((question) => <div key={question.id} className="rounded border p-2 text-sm"><span className="font-medium">{question.prompt}</span><span className="ml-2 text-xs text-muted-foreground">{question.questionType} · {question.points} point(s)</span></div>)}</div></CardContent></Card>}

          {canManage && <Card><CardHeader><CardTitle className="text-base">Mark submissions</CardTitle></CardHeader><CardContent className="space-y-3"><select aria-label="Content to mark" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedInteractionContent} onChange={(e) => void loadMarking(e.target.value)}><option value="">Select assignment or quiz</option>{contents.filter((item) => ['ASSIGNMENT', 'QUIZ'].includes(item.contentType ?? item.type ?? '')).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{markingSubmissions.map((submission) => <div key={submission.id} className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm">{submission.content?.title ?? submission.id}</span><div className="flex gap-2"><Input className="w-24" type="number" min={0} max={100} value={scoreDrafts[submission.id] ?? ''} onChange={(e) => setScoreDrafts((current) => ({ ...current, [submission.id]: e.target.value }))} placeholder="Score" /><Button size="sm" onClick={() => void gradeSubmission(submission.id, Number(scoreDrafts[submission.id]))} disabled={saving || !Number.isFinite(Number(scoreDrafts[submission.id]))}>Grade</Button></div></div>)}</CardContent></Card>}

          <Card>
            <CardHeader><CardTitle className="text-base">Course content</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {contents.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No content has been created for this course offering.</p>
              ) : contents.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{item.title || 'Untitled content'}</p>
                    <p className="text-xs text-muted-foreground">{item.contentType || item.type || 'CONTENT'} · {(item.published ?? item.isPublished) ? 'Published' : 'Draft'}</p>
                  </div>
                  {canManage && !(item.published ?? item.isPublished) && <Button size="sm" variant="outline" onClick={() => void publish(item.id)} disabled={saving}>Publish</Button>}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Announcements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {announcements.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No announcements yet.</p>
              ) : announcements.map((a) => (
                <article key={a.id} className="rounded-lg border p-3">
                  <h3 className="font-medium">{a.title || 'Announcement'}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body || ''}</p>
                </article>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
