import { t, number } from '../core/i18n';
import { coverage } from '../sim/goals';
import type { World } from '../sim/types';
import { chapters, ending, isReady, nextChapter } from '../story/folder';

export function folderPage(world: World) {
  const chapter = nextChapter(world);
  const history = world.story.length ? `<details><summary>${t('storyArchive')}</summary><ol>${world.story.map((choice,index) => `<li><b>${t(chapters[index].id+'Title')}</b> · ${t(choice)}</li>`).join('')}</ol></details>` : '';
  const cover = `<small class="folio-stamp">${t('storyName')}</small>`;
  if (!chapter) {
    const result = ending(world.story)!;
    return `<article class="folio">${cover}<h2>${t(result+'Title')}</h2><p>${t(result+'End')}</p><p>${t('storyContinue')}</p>${history}</article>`;
  }
  const signed = (value:number) => (value > 0 ? '+' : '') + number(value);
  const body = isReady(world) ? `<b>${t(chapter.speaker)}</b><blockquote>${t(chapter.id+'Letter')}</blockquote>${chapter.choices.map(choice => `<button data-story="${choice.id}" ${choice.cash < 0 && world.money < -choice.cash ? 'disabled' : ''}>${t(choice.id)}<small>${t('storyEffect',{cash:signed(choice.cash),trust:signed(choice.trust)})}</small></button>`).join('')}` : `<p>${t('storyBrief')}</p><p>${t('storyRequirements',{served:number(Math.min(world.served,chapter.served)),target:number(chapter.served),stops:Math.min(coverage(world),chapter.coverage),needed:chapter.coverage})}</p>`;
  return `<article class="folio">${cover}<h2>${world.story.length+1}/${chapters.length} · ${t(chapter.id+'Title')}</h2>${body}${history}</article>`;
}
