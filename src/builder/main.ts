import { createApp } from 'vue';
import { connect } from './session';
import { App } from './ui/app';
import type { Backend, RepoSnapshot } from './persist/types';

createApp(App).mount('#builder');

// Temporary: replaced by the real backends.
const temporary = {
  kind: 'demo',
  async load(): Promise<RepoSnapshot> {
    const { files } = (await (await fetch('/admin/builder/site.json')).json()) as { files: Record<string, string> };
    return {
      headOid: 'demo',
      mainOid: 'demo',
      files: Object.fromEntries(Object.entries(files).map(([path, text]) => [path, { path, text, oid: '' }])),
      images: {},
      draft: null,
      canWrite: false,
      login: '',
    };
  },
} as unknown as Backend;

connect(temporary);
