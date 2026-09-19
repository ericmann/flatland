/**
 * The `#app` grid structure (SPEC §5.1, §5.2, docs/mockup.html): top bar,
 * lens rail, world, inspector and dock. Only the containers are built
 * here — rail, inspector and dock stay empty until P2-09 (rail), P2-10
 * (inspector) and P2-11 (dock) fill them; `#app`'s own `idle`/`station`
 * mode class (which collapses the chrome via CSS) is owned by `app.js`,
 * not here.
 */

/**
 * @param {Document} [doc]
 * @returns {{ top: HTMLElement, rail: HTMLElement, world: HTMLElement, insp: HTMLElement, dock: HTMLElement }}
 */
export function createLayout(doc = document) {
  const top = doc.createElement('header');
  top.id = 'top';
  top.className = 'chrome';

  const rail = doc.createElement('aside');
  rail.id = 'rail';
  rail.className = 'chrome';

  const world = doc.createElement('main');
  world.id = 'world';

  const insp = doc.createElement('aside');
  insp.id = 'insp';
  insp.className = 'chrome';

  const dock = doc.createElement('footer');
  dock.id = 'dock';
  dock.className = 'chrome';

  return { top, rail, world, insp, dock };
}

/**
 * Attach a layout's containers to `#app`, in grid order.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof createLayout>} layout
 * @returns {void}
 */
export function mountLayout(root, layout) {
  root.replaceChildren(layout.top, layout.rail, layout.world, layout.insp, layout.dock);
}
