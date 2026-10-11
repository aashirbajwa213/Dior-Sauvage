import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  slug: string; // for links
  packSize?: number; // quantity of units in this item (e.g. 5 for Pack of 5)
}


// Persistent store to keep cart data across refreshes
// Encode/decode for JSON storage in localStorage
export const cartItems = persistentAtom<CartItem[]>('cart', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

export const isCartOpen = atom<boolean>(false);

export function addToCart(item: CartItem) {
  const currentItems = cartItems.get();
  const existingItemIndex = currentItems.findIndex((i) => i.id === item.id);

  if (existingItemIndex > -1) {
    const updatedItems = [...currentItems];
    updatedItems[existingItemIndex].quantity += 1;
    cartItems.set(updatedItems);
  } else {
    cartItems.set([...currentItems, { ...item, quantity: 1 }]);
  }

  // Open cart when adding item
  isCartOpen.set(true);
}

export function removeFromCart(itemId: string) {
  const currentItems = cartItems.get();
  cartItems.set(currentItems.filter((i) => i.id !== itemId));
}

export function updateQuantity(itemId: string, quantity: number) {
  const currentItems = cartItems.get();
  // If quantity is 0 or less, remove item
  if (quantity < 1) {
    removeFromCart(itemId);
    return;
  }

  const updatedItems = currentItems.map((item) => {
    if (item.id === itemId) {
      return { ...item, quantity };
    }
    return item;
  });
  cartItems.set(updatedItems);
}

export function clearCart() {
  cartItems.set([]);
}

export function toggleCart() {
  isCartOpen.set(!isCartOpen.get());
}
