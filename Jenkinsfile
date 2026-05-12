pipeline {

    agent any

    tools {
        nodejs 'node18'
    }

    environment {
        DOCKERHUB_USER     = 'biswajit7815'
        BACKEND_IMAGE      = "${DOCKERHUB_USER}/mern-backend"
        FRONTEND_IMAGE     = "${DOCKERHUB_USER}/mern-frontend"
        IMAGE_TAG          = "${BUILD_NUMBER}"
        SONAR_PROJECT      = 'mern-ecommerce'
        TRIVY_CACHE        = '/var/lib/trivy'
        BACKEND_CONTAINER  = 'mern-backend'
        FRONTEND_CONTAINER = 'mern-frontend'
        BACKEND_PORT       = '8000'
        EC2_PUBLIC_IP      = "${env.EC2_PUBLIC_IP ?: 'YOUR_EC2_PUBLIC_IP'}"
    }

    triggers {
        githubPush()
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
        disableConcurrentBuilds()
    }

    stages {

        // Checkout
        stage('Checkout') {
            steps {
                checkout scm
                sh '''
                    echo "Branch : $(git rev-parse --abbrev-ref HEAD)"
                    echo "Commit : $(git rev-parse --short HEAD)"
                    echo "Build  : ${BUILD_NUMBER}"
                '''
            }
        }

        // Install Dependencies
        stage('Install Dependencies') {
            parallel {

                stage('Backend Install') {
                    steps {
                        dir('backend') {
                            sh 'npm ci --prefer-offline || npm install'
                        }
                    }
                }

                stage('Frontend Install') {
                    steps {
                        dir('frontend') {
                            sh 'npm ci --prefer-offline --legacy-peer-deps || npm install --legacy-peer-deps'
                        }
                    }
                }
            }
        }

        // Security Scans
        stage('Security Scans') {
            parallel {

                stage('OWASP Dependency Check') {
                    steps {
                        sh 'mkdir -p reports/owasp'

                        dependencyCheck(
                            additionalArguments: '''
                                --scan backend/
                                --scan frontend/
                                --format HTML
                                --format XML
                                --out reports/owasp/
                                --disableAssembly
                                --disableYarnAudit
                                --disableNodeAudit
                                --prettyPrint
                            ''',
                            odcInstallation: 'DP-Check'
                        )

                        dependencyCheckPublisher(
                            pattern: 'reports/owasp/dependency-check-report.xml'
                        )
                    }
                }

                stage('Trivy FS Scan') {
                    steps {
                        sh '''
                            mkdir -p reports/trivy

                            trivy fs . \
                                --exit-code 0 \
                                --severity HIGH,CRITICAL \
                                --cache-dir ${TRIVY_CACHE} \
                                --format table \
                                -o reports/trivy/fs-scan.txt

                            cat reports/trivy/fs-scan.txt
                        '''
                    }
                }
            }
        }

        // SonarQube Analysis
        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('sonar-server') {

                    withCredentials([
                        string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')
                    ]) {

                        sh """
                            ${tool 'sonar-scanner'}/bin/sonar-scanner \
                                -Dsonar.projectKey=${SONAR_PROJECT} \
                                -Dsonar.projectName='MERN Ecommerce' \
                                -Dsonar.sources=backend/,frontend/src/ \
                                -Dsonar.exclusions=*/node_modules/,/build/,/dist/,/.test.js \
                                -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                                -Dsonar.login=${SONAR_TOKEN}
                        """
                    }
                }
            }
        }

        // Quality Gate
        stage('Quality Gate') {
            steps {
                // abortPipeline: false → quality gate fail hone par pipeline nahi rukti
                timeout(time: 15, unit: 'MINUTES') {
                    waitForQualityGate(abortPipeline: false)
                }
            }
        }

        // Build Docker Images
        stage('Build Docker Images') {
            steps {
                sh """
                    docker build \
                        -t ${BACKEND_IMAGE}:${IMAGE_TAG} \
                        -t ${BACKEND_IMAGE}:latest \
                        -f backend/Dockerfile \
                        ./backend

                    docker build \
                        --build-arg REACT_APP_BASE_URL=http://${EC2_PUBLIC_IP}:${BACKEND_PORT} \
                        -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                        -t ${FRONTEND_IMAGE}:latest \
                        -f frontend/Dockerfile \
                        ./frontend
                """
            }
        }

        // Trivy Image Scan
        stage('Trivy Image Scan') {
            parallel {

                stage('Backend Image Scan') {
                    steps {
                        sh """
                            trivy image \
                                --exit-code 0 \
                                --severity HIGH,CRITICAL \
                                --cache-dir ${TRIVY_CACHE} \
                                --format table \
                                -o reports/trivy/backend-image-scan.txt \
                                ${BACKEND_IMAGE}:${IMAGE_TAG}

                            cat reports/trivy/backend-image-scan.txt
                        """
                    }
                }

                stage('Frontend Image Scan') {
                    steps {
                        sh """
                            trivy image \
                                --exit-code 0 \
                                --severity HIGH,CRITICAL \
                                --cache-dir ${TRIVY_CACHE} \
                                --format table \
                                -o reports/trivy/frontend-image-scan.txt \
                                ${FRONTEND_IMAGE}:${IMAGE_TAG}

                            cat reports/trivy/frontend-image-scan.txt
                        """
                    }
                }
            }
        }

        // Push to DockerHub
        stage('Push to DockerHub') {
            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-hub-creds',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )
                ]) {

                    sh """
                        echo "${DOCKER_PASS}" | docker login -u "${DOCKER_USER}" --password-stdin

                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest

                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest

                        docker logout
                    """
                }
            }
        }

        // Deploy
        stage('Deploy') {
            steps {

                // Jenkins me ye secret text credentials banao:
                // MONGO_URI | SECRET_KEY | APP_EMAIL | APP_EMAIL_PASSWORD

                withCredentials([
                    string(credentialsId: 'MONGO_URI', variable: 'MONGO_URI'),
                    string(credentialsId: 'SECRET_KEY', variable: 'SECRET_KEY'),
                    string(credentialsId: 'APP_EMAIL', variable: 'APP_EMAIL'),
                    string(credentialsId: 'APP_EMAIL_PASSWORD', variable: 'APP_EMAIL_PASSWORD')
                ]) {

                    sh """
                        # Purane containers band karo
                        docker stop ${BACKEND_CONTAINER}  2>/dev/null || true
                        docker stop ${FRONTEND_CONTAINER} 2>/dev/null || true

                        docker rm ${BACKEND_CONTAINER}  2>/dev/null || true
                        docker rm ${FRONTEND_CONTAINER} 2>/dev/null || true

                        # Shared network banao
                        docker network create mern-network 2>/dev/null || true

                        # Backend container start karo
                        docker run -d \
                            --name ${BACKEND_CONTAINER} \
                            --network mern-network \
                            --restart unless-stopped \
                            -p ${BACKEND_PORT}:${BACKEND_PORT} \
                            -e MONGO_URI="${MONGO_URI}" \
                            -e ORIGIN="http://${EC2_PUBLIC_IP}" \
                            -e SECRET_KEY="${SECRET_KEY}" \
                            -e EMAIL="${APP_EMAIL}" \
                            -e PASSWORD="${APP_EMAIL_PASSWORD}" \
                            -e LOGIN_TOKEN_EXPIRATION="30d" \
                            -e OTP_EXPIRATION_TIME="120000" \
                            -e PASSWORD_RESET_TOKEN_EXPIRATION="2m" \
                            -e COOKIE_EXPIRATION_DAYS="30" \
                            -e PRODUCTION="true" \
                            -e NODE_ENV="production" \
                            ${BACKEND_IMAGE}:${IMAGE_TAG}

                        # Frontend container start karo
                        docker run -d \
                            --name ${FRONTEND_CONTAINER} \
                            --network mern-network \
                            --restart unless-stopped \
                            -p 80:80 \
                            ${FRONTEND_IMAGE}:${IMAGE_TAG}

                        # Containers ready hone ka wait karo
                        sleep 15

                        # Status check karo
                        docker ps --filter "name=${BACKEND_CONTAINER}" --format "{{.Names}} → {{.Status}}"

                        docker ps --filter "name=${FRONTEND_CONTAINER}" --format "{{.Names}} → {{.Status}}"

                        # Health checks
                        curl -sf http://localhost:${BACKEND_PORT}/health \
                            && echo "Backend healthy" \
                            || echo "Backend /health respond nahi kar raha — docker logs ${BACKEND_CONTAINER} dekho"

                        curl -sf http://localhost/health \
                            && echo "Frontend (Nginx) healthy" \
                            || echo "Nginx health check failed — docker logs ${FRONTEND_CONTAINER} dekho"

                        echo "App live: http://${EC2_PUBLIC_IP}"
                    """
                }
            }
        }

        // Cleanup Old Images
        stage('Cleanup Old Images') {
            steps {

                sh """
                    # Dangling images hata do
                    docker image prune -f

                    # Purane backend tags hata do
                    docker images ${BACKEND_IMAGE} --format "{{.Tag}}" \
                        | grep -v "latest" \
                        | grep -v "${IMAGE_TAG}" \
                        | xargs -r -I {} docker rmi ${BACKEND_IMAGE}:{} || true

                    # Purane frontend tags hata do
                    docker images ${FRONTEND_IMAGE} --format "{{.Tag}}" \
                        | grep -v "latest" \
                        | grep -v "${IMAGE_TAG}" \
                        | xargs -r -I {} docker rmi ${FRONTEND_IMAGE}:{} || true
                """
            }
        }
    }

    // Post Actions
    post {

        always {

            // Reports archive karo
            archiveArtifacts(
                artifacts: 'reports/trivy/*.txt, reports/owasp/dependency-check-report.html',
                allowEmptyArchive: true,
                fingerprint: true
            )

            // OWASP HTML report Jenkins UI me dikhao
            publishHTML([
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/owasp',
                reportFiles: 'dependency-check-report.html',
                reportName: 'OWASP Dependency Check'
            ])
        }

        success {
            echo "Build #${BUILD_NUMBER} successfully deployed → http://${EC2_PUBLIC_IP}"
        }

        failure {
            echo "Build #${BUILD_NUMBER} failed. Console output check karo: ${BUILD_URL}console"

            // Email notification ke liye uncomment karo:
            // mail to: 'your@email.com',
            //      subject: "Build #${BUILD_NUMBER} Failed — mern-ecommerce",
            //      body: "Details: ${BUILD_URL}"
        }

        cleanup {

            // Success ke baad workspace clean karo
            cleanWs(
                cleanWhenSuccess: true,
                cleanWhenFailure: false,
                cleanWhenAborted: true
            )
        }
    }
}