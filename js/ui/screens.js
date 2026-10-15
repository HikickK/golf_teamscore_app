// 画面の一覧。各画面は { id, label, render(container, ctx) } を持つ。
// どの画面をタブに出すか・並び順はモードで決まる（js/mode.js の screensFor）。
import { screen as settings } from './settings-screen.js';
import { screen as teams } from './teams-screen.js';
import { screen as data } from './data-screen.js';
import { screen as importScreen } from './import-screen.js';
import { screen as input } from './input-screen.js';
import { screen as assign } from './assign-screen.js';
import { screen as ranking } from './ranking-screen.js';

export const SCREENS = [settings, teams, data, importScreen, input, assign, ranking];
