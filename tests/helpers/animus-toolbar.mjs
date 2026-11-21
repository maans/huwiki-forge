// Follow the same two controls as a visitor, including native touch input.
export async function chooseToolbarItem(editor, menu, selector, input = 'click') {
 await editor.locator(`.huw-musical-menu-trigger[data-menu="${menu}"]`)[input]();
 await editor.locator(selector)[input]();
}
