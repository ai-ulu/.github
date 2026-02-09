from setuptools import setup, find_packages

setup(
    name="ai-ulu-cli",
    version="1.0.0",
    description="AI-ULU Autonomous System CLI - Tak-çalıştır kurulum",
    author="AI-ULU Team",
    author_email="team@ai-ulu.io",
    url="https://github.com/ai-ulu/.github",
    packages=find_packages(),
    scripts=['ai-ulu'],
    entry_points={
        'console_scripts': [
            'ai-ulu=ai-ulu:main',
        ],
    },
    install_requires=[
        'requests>=2.31.0',
        'pyyaml>=6.0.0',
    ],
    python_requires='>=3.8',
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'Topic :: Software Development :: Build Tools',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.8',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
    ],
    keywords='ai autonomous devops github automation',
    project_urls={
        'Bug Reports': 'https://github.com/ai-ulu/.github/issues',
        'Source': 'https://github.com/ai-ulu/.github',
    },
)