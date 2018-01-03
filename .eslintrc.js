module.exports = {
    "extends": "airbnb-base",
    "rules": {
        "indent": ["error", 4],
        // these two are a problem when not using proper modules
        "no-undef": "off",
        "no-unused-vars": "off",

        "spaced-comment": "off",
        "no-continue": "off",
        "space-infix-ops": "off",
        "prefer-destructuring": ["error", {"object": true, "array": false}],

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
