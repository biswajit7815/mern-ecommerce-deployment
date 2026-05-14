pipeline {

    agent any

    tools {
        nodejs 'node18'
        jdk 'jdk21'
    }

    environment {
        DOCKERHUB_USER     = 'biswajit7815'

        BACKEND_IMAGE      = "${DOCKERHUB_USER}/mern-backend"
        FRONTEND_IMAGE     = "${DOCKERHUB_USER}/mern-frontend"

        IMAGE_TAG          = "${BUILD_NUMBER}"
        SONAR_PROJECT      = 'mern-ecommerce'
        SCANNER_HOME       = tool 'sonar-scanner'
        TRIVY_CACHE        = '/var/lib/trivy'
        BACKEND_CONTAINER  = 'mern-backend'
        FRONTEND_CONTAINER = 'mern-frontend'

        BACKEND_PORT       = '8000'

        EC2_PUBLIC_IP      = "${env.EC2_PUBLIC_IP ?: '13.126.203.252'}"
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
                            sh 'npm install'
                        }
                    }
                }

                stage('Frontend Install') {
                    steps {

                        dir('frontend') {
                            sh 'npm install --legacy-peer-deps'
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
                            pattern: 'reports/owasp/dependency-check-report.xml',
                            failedTotalCritical: 10,
                            unstableTotalCritical: 5
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


        // Build Docker Images
        stage('Build Docker Images') {
            steps {

                sh """
                    echo "Building Backend Image..."

                    docker build \
                        -t ${BACKEND_IMAGE}:${IMAGE_TAG} \
                        -t ${BACKEND_IMAGE}:latest \
                        -f backend/Dockerfile \
                        ./backend

                    echo "Building Frontend Image..."

                    docker build \
                        --build-arg REACT_APP_BASE_URL=http://${EC2_PUBLIC_IP}:${BACKEND_PORT} \
                        -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                        -t ${FRONTEND_IMAGE}:latest \
                        -f frontend/Dockerfile \
                        ./frontend
                """
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

                withCredentials([
                    string(credentialsId: 'MONGO_URI', variable: 'MONGO_URI'),
                    string(credentialsId: 'SECRET_KEY', variable: 'SECRET_KEY'),
                    string(credentialsId: 'EMAIL', variable: 'EMAIL'),
                    string(credentialsId: 'EMAIL_PASSWORD', variable: 'EMAIL_PASSWORD')
                ]) {

                    sh """
                        echo "Stopping old containers..."

                        docker stop ${BACKEND_CONTAINER} 2>/dev/null || true
                        docker stop ${FRONTEND_CONTAINER} 2>/dev/null || true

                        docker rm ${BACKEND_CONTAINER} 2>/dev/null || true
                        docker rm ${FRONTEND_CONTAINER} 2>/dev/null || true

                        echo "Creating Docker network..."

                        docker network create mern-network 2>/dev/null || true

                        echo "Starting Backend Container..."

                        docker run -d \
                            --name ${BACKEND_CONTAINER} \
                            --network mern-network \
                            --restart unless-stopped \
                            -p ${BACKEND_PORT}:${BACKEND_PORT} \
                            -e MONGO_URI="${MONGO_URI}" \
                            -e ORIGIN="http://${EC2_PUBLIC_IP}" \
                            -e SECRET_KEY="${SECRET_KEY}" \
                            -e EMAIL="${EMAIL}" \
                            -e PASSWORD="${EMAIL_PASSWORD}" \
                            -e LOGIN_TOKEN_EXPIRATION="30d" \
                            -e OTP_EXPIRATION_TIME="120000" \
                            -e PASSWORD_RESET_TOKEN_EXPIRATION="2m" \
                            -e COOKIE_EXPIRATION_DAYS="30" \
                            -e PRODUCTION="true" \
                            -e NODE_ENV="production" \
                            ${BACKEND_IMAGE}:${IMAGE_TAG}

                        echo "Starting Frontend Container..."

                        docker run -d \
                            --name ${FRONTEND_CONTAINER} \
                            --network mern-network \
                            --restart unless-stopped \
                            -p 80:80 \
                            ${FRONTEND_IMAGE}:${IMAGE_TAG}

                        echo "Waiting for containers..."

                        sleep 15

                        echo "Container Status"

                        docker ps --filter "name=${BACKEND_CONTAINER}"
                        docker ps --filter "name=${FRONTEND_CONTAINER}"

                        echo "Backend Health Check"

                        curl -sf http://localhost:${BACKEND_PORT}/api/health \
                            && echo "Backend Healthy" \
                            || echo "Backend Health Failed"

                        echo "Frontend Health Check"

                        curl -sf http://localhost \
                            && echo "Frontend Healthy" \
                            || echo "Frontend Health Failed"

                        echo "Application Live : http://${EC2_PUBLIC_IP}"
                    """
                }
            }
        }

        // Cleanup
        stage('Cleanup Old Images') {
            steps {

                sh """
                    echo "Cleaning dangling images..."

                    docker image prune -f

                    echo "Removing old backend images..."

                    docker images ${BACKEND_IMAGE} --format "{{.Tag}}" \
                        | grep -v "latest" \
                        | grep -v "${IMAGE_TAG}" \
                        | xargs -r -I {} docker rmi ${BACKEND_IMAGE}:{} || true

                    echo "Removing old frontend images..."

                    docker images ${FRONTEND_IMAGE} --format "{{.Tag}}" \
                        | grep -v "latest" \
                        | grep -v "${IMAGE_TAG}" \
                        | xargs -r -I {} docker rmi ${FRONTEND_IMAGE}:{} || true
                """
            }
        }
    }

    post {

        success {
            echo "Build #${BUILD_NUMBER} deployed successfully → http://${EC2_PUBLIC_IP}"
        }

        failure {
            echo "Build #${BUILD_NUMBER} failed → ${BUILD_URL}console"
        }

        cleanup {

            cleanWs(
                cleanWhenSuccess: true,
                cleanWhenFailure: false,
                cleanWhenAborted: true
            )
        }
    }
}