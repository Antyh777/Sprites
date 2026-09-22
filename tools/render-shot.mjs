/**
 * render-shot.mjs — "capturas" del juego sin navegador
 *
 * Dibuja escenas reales del juego y exporta PNG para revisarlas.
 * Todo el entorno (canvas simulado, carga del juego, montajes) vive en
 * tools/fake-canvas.mjs, compartido con tools/motion-test.mjs.
 *
 * Uso:  node tools/render-shot.mjs /tmp/shots
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootGame, toPNG } from './fake-canvas.mjs';

const OUT = process.argv[2] || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const rig = await bootGame();
const {
  Game, Sprites, Input, UI, views, VIEW,
  shot, crop, hstack, vstack,
} = rig;

/*
 * Nota: cuando el guion automático avanza la simulación, el modo de vista se
 * deja en 'auto' (menos arriba, donde forzamos una vista por pose).
 */

/* ---- utilidades de montaje (vienen del entorno compartido) ---- */

/* ---- 1. poses de animación dentro del juego ---- */

function poseShot(view, anim, frame) {
  Game.viewMode = view;
  Game.setView(view);
  Game.player.x = 560;
  Game.player.y = Game.GROUND_TOP - Game.player.h;
  Game.player.vx = anim === 'idle' ? 0 : 100;
  Game.player.anim = anim;
  Game.player.frame = frame;
  Game.cam.x = Math.round(Game.player.x - VIEW.w * 0.42);
  Game.render();
  return crop(shot(), 150, 110, 110, 90);
}

const poses = [];
[['front', 'idle', 0], ['front', 'walk', 0], ['front', 'walk', 3], ['front', 'run', 2], ['front', 'jump', 0]]
  .forEach(([v, a, f]) => poses.push(poseShot(v, a, f)));
writeFileSync(resolve(OUT, 'poses-front.png'), toPNG(hstack(poses)));

const sidePoses = [];
[['side', 'walk', 0], ['side', 'walk', 2], ['side', 'walk', 4], ['side', 'run', 1], ['side', 'run', 4], ['side', 'jump', 0], ['side', 'fall', 0]]
  .forEach(([v, a, f]) => sidePoses.push(poseShot(v, a, f)));
writeFileSync(resolve(OUT, 'poses-side.png'), toPNG(hstack(sidePoses)));

const backPoses = [];
[['back', 'idle', 0], ['back', 'walk', 1], ['back', 'run', 3], ['back', 'fall', 1]]
  .forEach(([v, a, f]) => backPoses.push(poseShot(v, a, f)));
writeFileSync(resolve(OUT, 'poses-back.png'), toPNG(hstack(backPoses)));

/* ---- 1b. primer plano del jugador dentro del juego ---- */

function playerCloseUp(view, anim, frame, facing) {
  Game.viewMode = view;
  Game.setView(view);
  const p = Game.player;
  p.x = 560;
  p.y = Game.GROUND_TOP - p.h;
  p.vx = anim === 'idle' ? 0 : 100;
  p.facing = facing;
  p.anim = anim;
  p.frame = frame;
  Game.cam.x = Math.round(p.x - VIEW.w * 0.42);
  Game.render();
  const surf = shot();
  const cx = Math.round(p.x + p.w / 2 - Game.cam.x);
  const feet = Math.round(p.y + p.h);
  return crop(surf, cx - 26, feet - 46, 52, 50).scaled(3);
}

const closeUps = [];
[['side', 'walk', 0], ['side', 'walk', 1], ['side', 'walk', 2], ['side', 'walk', 3], ['side', 'run', 1], ['side', 'run', 4]]
  .forEach(([v, a, f]) => closeUps.push(playerCloseUp(v, a, f, 1)));
writeFileSync(resolve(OUT, 'primer-plano-derecha.png'), toPNG(hstack(closeUps, 4)));

const closeUpsL = [];
[['side', 'walk', 0], ['side', 'walk', 2], ['side', 'run', 2], ['side', 'jump', 0], ['side', 'fall', 0]]
  .forEach(([v, a, f]) => closeUpsL.push(playerCloseUp(v, a, f, -1)));
writeFileSync(resolve(OUT, 'primer-plano-izquierda.png'), toPNG(hstack(closeUpsL, 4)));

const closeUpsF = [];
[['front', 'idle', 0], ['front', 'idle', 3], ['front', 'walk', 1], ['front', 'run', 2], ['front', 'jump', 1]]
  .forEach(([v, a, f]) => closeUpsF.push(playerCloseUp(v, a, f, 1)));
writeFileSync(resolve(OUT, 'primer-plano-frente.png'), toPNG(hstack(closeUpsF, 4)));

/* ---- 2. escenas completas jugando con el piloto automático ---- */

Game.start();
Game.options.autoplay = true;
const scenes = [];
const marks = [90, 260, 520, 900, 1500, 2100, 2500];
let step = 0;
while (step <= Math.max(...marks) && Game.state !== 'complete') {
  Game.update(1 / 60);
  step++;
  if (marks.includes(step)) {
    Game.render();
    scenes.push(crop(shot(), 0, 0, VIEW.w, VIEW.h));
  }
}
Game.options.autoplay = false;

// media vuelta: escenas corriendo hacia la izquierda
Game.start();
Game.viewMode = 'auto';
Input.set('left', true);
Input.set('run', true);
for (let i = 0; i < 200; i++) {
  Game.update(1 / 60);
  if (i === 60 || i === 130) {
    Game.render();
    scenes.push(crop(shot(), 0, 0, VIEW.w, VIEW.h));
  }
}
Input.set('left', false);
Input.set('run', false);
writeFileSync(resolve(OUT, 'escenas.png'), toPNG(vstack(scenes)));

/* ---- 3. fondo con y sin parallax + vista de colisiones ---- */

Game.start();
Game.viewMode = 'auto';
Game.player.x = 1400;
Game.player.y = Game.GROUND_TOP - Game.player.h;
Game.cam.x = 1200;
Game.options.parallax = true; Game.render();
const parOn = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.parallax = false; Game.render();
const parOff = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.parallax = true;
Game.options.hitboxes = true; Game.render();
const hit = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.hitboxes = false;
writeFileSync(resolve(OUT, 'extras.png'), toPNG(vstack([parOn, parOff, hit])));


console.log('PNG escritos en ' + OUT + ' (poses-front/side/back, primer-plano-*, escenas, extras)');

// jsdom mantiene vivo el bucle de requestAnimationFrame: cerramos a mano
process.exit(0);
