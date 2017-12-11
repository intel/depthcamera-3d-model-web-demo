module.exports = {
    "extends": "airbnb-base",
    "rules": {
        "indent": ["error", 4],
        // these two are a problem when not using proper modules
        "no-undef": "off",
        "no-unused-vars": "off",

        "no-console": "off",
        "func-names": ["off", "never"],
    },
    "env": {
        "browser": true,
        "node": false,
    },
    "plugins": [
        "import"
    ]
};
