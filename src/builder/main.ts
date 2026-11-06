import './zod-config';
import { createApp } from 'vue';
import { start } from './session';
import { App } from './ui/app';

createApp(App).mount('#builder');
void start();
