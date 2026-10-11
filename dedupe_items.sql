
DELETE FROM order_items
WHERE id NOT IN (
    SELECT MIN(id)
    FROM order_items
    GROUP BY order_id, product_name
);
