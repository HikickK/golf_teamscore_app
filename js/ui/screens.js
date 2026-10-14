// 5 つの画面の一覧（タブの並び順）。各画面は { id, label, render(container, ctx) } を持つ。
import { screen as settings } from './settings-screen.js';
import { screen as teams } from './teams-screen.js';
import { screen as input } from './input-screen.js';
import { screen as assign } from './assign-screen.js';
import { screen as ranking } from './ranking-screen.js';

export const SCREENS = [settings, teams, input, assign, ranking];
