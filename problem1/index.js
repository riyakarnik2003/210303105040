const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = 9876;
const testURL = 'http://20.244.56.144/test';
const COMPANIES = ['AMZ', 'FLP', 'SNP', 'MYN', 'ARO'];
const maxProducts = 10;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;  // Load access token from environment variables

// Fetch products from the test server for a specific company, category, and price range
const fetchProductsFromServer = async (company, category, minPrice, maxPrice, topN) => {
    try {
        const response = await axios.get(`${testURL}/companies/${company}/categories/${category}/products`, {
            params: { 'top-n': topN, minPrice, maxPrice },
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },  // Add authorization header
            timeout: 500,
        });
        return response.data.products || [];
    } catch (error) {
        console.error(`Error fetching products for ${company}:`, error.message);
        return [];
    }
};

// Aggregate and deduplicate products from all companies
const getAggregatedProducts = async (category, minPrice, maxPrice, topN) => {
    let allProducts = [];
    for (const company of COMPANIES) {
        const products = await fetchProductsFromServer(company, category, minPrice, maxPrice, topN);
        allProducts = allProducts.concat(products);
    }
    const uniqueProducts = Array.from(new Set(allProducts.map(p => p.id))).map(id => {
        return allProducts.find(p => p.id === id);
    });
    return uniqueProducts;
};

// Sort products based on query parameters
const sortProducts = (products, sortBy, sortOrder) => {
    if (!sortBy) return products;
    return products.sort((a, b) => {
        if (sortOrder === 'desc') {
            return b[sortBy] - a[sortBy];
        } else {
            return a[sortBy] - b[sortBy];
        }
    });
};

// Generate custom unique identifier for each product
const generateProductIds = (products) => {
    return products.map(product => ({
        ...product,
        customId: uuidv4(),
    }));
};

// GET /categories/:category/products
app.get('/categories/:category/products', async (req, res) => {
    const { category } = req.params;
    const { n = 10, page = 1, sortBy, sortOrder = 'asc', minPrice = 0, maxPrice = 1000000 } = req.query;
    const numProducts = parseInt(n);
    const pageNumber = parseInt(page);

    try {
        if (numProducts > MAX_PRODUCTS_PER_PAGE && !req.query.page) {
            return res.status(400).json({ error: 'Pagination required for more than 10 products' });
        }

        const allProducts = await getAggregatedProducts(category, minPrice, maxPrice, numProducts);
        const sortedProducts = sortProducts(allProducts, sortBy, sortOrder);
        const paginatedProducts = sortedProducts.slice((pageNumber - 1) * numProducts, pageNumber * numProducts);
        const productsWithIds = generateProductIds(paginatedProducts);

        res.json({
            products: productsWithIds,
            total: allProducts.length,
            currentPage: pageNumber,
            totalPages: Math.ceil(allProducts.length / numProducts),
            perPage: numProducts,
        });
    } catch (error) {
        console.error('Error handling request:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /categories/:category/products/:productid
app.get('/categories/:category/products/:productid', async (req, res) => {
    const { category, productid } = req.params;

    try {
        const allProducts = await getAggregatedProducts(category, 0, 1000000, maxProducts);
        const product = allProducts.find(p => p.customId === productid);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(product);
    } catch (error) {
        console.error('Error handling request:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
