/**
 * Saving and publishing, in the top bar. A save opens a preview on its own
 * address; Publish merges it. The words here follow what's really happening, and
 * say what's safe: an editor should never have to wonder whether work is lost.
 */
import { computed, defineComponent, h, ref, type VNode } from 'vue';
import { PREVIEW_CHECK } from '../persist/types';
import { discardDraft, hasUnsaved, previewLink, publish, saveDraft, session, startSignIn } from '../session';
import { dirtyPages, dirtySite, select, openPage, state } from '../store';

const statusLine = computed(() => {
  if (session.kind === 'demo') return 'Trying it out: nothing here is saved';
  if (session.busy) return session.busy;
  if (session.publishing) return 'Publishing to the live site…';
  if (dirtyPages.value.length || dirtySite.value) return 'Unsaved changes, kept on this computer';
  const status = session.status;
  if (!session.draft) return 'Everything is published';
  if (!status || status.state === 'building') return 'Building a preview…';
  if (status.state === 'failed') return 'The preview couldn’t be built';
  if (status.state === 'stuck') return 'The preview is taking too long';
  return 'Preview ready';
});

const copy = (text: string) => navigator.clipboard?.writeText(text);

export const PublishControls = defineComponent({
  name: 'PublishControls',
  setup() {
    const confirming = ref(false);

    const canPublish = computed(() => session.status?.state === 'ready' && !hasUnsaved() && !session.busy);
    const testsFailed = computed(() => session.status?.state === 'ready' && session.status.tests === 'failed');

    function onPublish(): void {
      if (testsFailed.value && !confirming.value) {
        confirming.value = true;
        return;
      }
      confirming.value = false;
      void publish();
    }

    return () => {
      const status = session.status;
      const previewUrl = status?.state === 'ready' ? status.previewUrl : null;
      const nodes: (VNode | null)[] = [h('p', { class: 'bar__status', role: 'status' }, statusLine.value)];

      if (session.kind === 'demo') return nodes;

      if (previewUrl) nodes.push(h('a', { class: 'button button--quiet', href: previewLink(previewUrl), target: '_blank', rel: 'noopener' }, 'Preview'));
      if (session.draft && !session.busy) {
        nodes.push(h('button', { type: 'button', class: 'link', onClick: () => void discardDraft() }, 'Discard draft'));
      }
      if (hasUnsaved()) {
        nodes.push(
          h('button', { type: 'button', class: 'button', disabled: !!session.busy || !session.canWrite, onClick: () => void saveDraft() }, 'Save draft')
        );
      } else if (session.draft) {
        nodes.push(h('button', { type: 'button', class: 'button', disabled: !canPublish.value, onClick: onPublish }, 'Publish'));
      }
      return nodes;
    };
  },
});

/** Anything an editor needs to read or decide, under the top bar. */
export const Messages = defineComponent({
  name: 'Messages',
  setup() {
    const message = (tone: string, title: string, body?: string, actions: (VNode | null)[] = []) =>
      h('div', { class: ['message', `message--${tone}`], role: tone === 'problem' ? 'alert' : 'status' }, [
        h('div', [h('p', { class: 'message__title' }, title), body ? h('p', { class: 'message__body' }, body) : null]),
        h('div', { class: 'message__actions' }, actions),
      ]);

    const dismiss = (clear: () => void) => h('button', { type: 'button', class: 'link', onClick: clear }, 'Dismiss');

    return () => {
      const list: VNode[] = [];
      const status = session.status;

      if (session.phase === 'ready' && !session.canWrite && session.kind === 'github') {
        list.push(message('problem', 'This account can look but can’t save.', 'Ask your developer for access to the site, then sign in again.'));
      }
      if (session.kind === 'demo' && !session.demoNoted) {
        list.push(
          message('note', 'You’re trying the builder out.', 'To save, sign in at /admin/ with a token, then come back here.', [
            h('a', { class: 'link', href: '/admin/' }, 'Go to the admin'),
            dismiss(() => (session.demoNoted = true)),
          ])
        );
      }
      if (session.error) {
        list.push(
          message('problem', session.error, undefined, [
            session.details ? h('button', { type: 'button', class: 'link', onClick: () => copy(session.details) }, 'Copy details') : null,
            dismiss(() => (session.error = '')),
          ])
        );
      }
      if (status?.state === 'failed') {
        list.push(
          message('problem', 'The preview couldn’t be built.', 'Your draft is safe and the live site hasn’t changed.', [
            h('button', { type: 'button', class: 'link', onClick: () => copy(status.details) }, 'Copy details'),
          ])
        );
      }
      if (status?.state === 'stuck') {
        list.push(message('problem', 'The preview is taking too long.', `${PREVIEW_CHECK} hasn’t answered. Your draft is safe. Try again in a while.`));
      }
      if (status?.state === 'ready' && status.tests === 'failed') {
        list.push(message('note', 'The automatic checks found a problem.', 'The preview works, and it may be nothing, but it’s worth a look before you publish. Press Publish twice to go ahead.'));
      }
      if (session.conflicts.length) {
        list.push(
          message('problem', 'Someone changed the same thing on the live site.', session.conflicts.map((c) => c.message).join(' '), [
            h('button', { type: 'button', class: 'link', onClick: () => (session.conflicts = []) }, 'Keep my version'),
          ])
        );
      }
      if (session.outOfDate) {
        list.push(
          message('note', 'The site was updated moments ago.', 'What you see here may be a step behind. Reload in a minute or two to catch up.', [
            dismiss(() => (session.outOfDate = false)),
          ])
        );
      }
      if (session.restored) {
        list.push(message('note', 'Your unsaved changes are back.', 'They were kept on this computer.', [dismiss(() => (session.restored = false))]));
      }
      if (session.notice) list.push(message('good', session.notice, undefined, [dismiss(() => (session.notice = ''))]));

      return list.length ? h('div', { class: 'messages' }, list) : null;
    };
  },
});

/** Problems stopping a save, in the Checks panel. */
export function Blockers(): VNode | null {
  if (!session.blockers.length) return null;
  return h('section', { class: 'library' }, [
    h('h3', { class: 'group__title' }, 'Fix these to save'),
    h(
      'ul',
      { class: 'checks' },
      session.blockers.map((problem) =>
        h('li', [
          h(
            'button',
            {
              type: 'button',
              class: 'check',
              onClick: () => {
                openPage(problem.page);
                if (problem.section) select({ section: problem.section, element: problem.element });
                state.panel = 'checks';
              },
            },
            problem.message
          ),
        ])
      )
    ),
  ]);
}

export const SignIn = defineComponent({
  name: 'SignIn',
  setup() {
    return () =>
      h('div', { class: 'gate' }, [
        h('img', { class: 'gate__mark', src: '/favicon.svg', alt: '' }),
        h('h1', { class: 'gate__title' }, 'Sign in to edit the site'),
        h('p', 'Use the same GitHub account as the admin.'),
        h('button', { type: 'button', class: 'button', onClick: () => void startSignIn() }, 'Sign in with GitHub'),
        session.error ? h('p', { class: 'hint', role: 'alert' }, session.error) : null,
      ]);
  },
});
