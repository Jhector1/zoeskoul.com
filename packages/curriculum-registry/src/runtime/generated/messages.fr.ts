/* eslint-disable */
// AUTO-GENERATED canonical curriculum messages for fr.
const messages: Record<string, any> = {
  "topics": {
    "linux-terminal-fundamentals": {
      "linux-module-1-terminal-navigation": {
        "module-1-terminal-map-project": {
          "label": "Projet : Plan du terminal",
          "summary": "Créez un petit plan de répertoires pour un projet de notes de terrain en utilisant les commandes `ls`, `cd` et `pwd` pour voir où vous vous trouvez et vous déplacer d'un répertoire à l'autre.",
          "cards": {
            "sketch0": {
              "title": "Résumé du projet « Notes de terrain sur la carte du terminal »"
            },
            "project": {
              "title": "Projet « Notes de terrain sur la carte du terminal »"
            }
          },
          "moduleProject": {
            "steps": {
              "module-1-terminal-map-project-terminal-task-1": {
                "title": "Accédez au dossier du projet",
                "prompt": "Vous aidez une équipe chargée de l'étude du parc à retracer le plan d'un terminal existant. Lancez la commande « ls », accédez au dossier « park-terminal-map », puis utilisez la commande « pwd » pour vérifier que vous vous trouvez bien dans le dossier du projet.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Concentrez-vous sur l'étape où vous en êtes, sur les dossiers que vous pouvez voir et sur la prochaine étape à franchir.",
                  "hint_1": "Commencez par taper « ls » pour voir le dossier dans lequel vous devez entrer.",
                  "hint_2": "Une fois que vous vous êtes placé dans le dossier du projet, exécutez la commande « pwd » pour vérifier où vous vous trouvez."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Commencez par afficher le contenu de l'espace de travail à l'aide de la commande ls."
                    },
                    "1": {
                      "message": "Accéder à la carte du parc-terminal."
                    },
                    "2": {
                      "message": "Lancez la commande « pwd » après avoir saisi « park-terminal-map »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes de l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "park_terminal_map_requests_north_trail_txt": {
                    "content": "North trail request log\n"
                  },
                  "park_terminal_map_maps_current_location_txt": {
                    "content": "Current location checked with pwd and ls\n"
                  },
                  "park_terminal_map_handoff_terminal_map_ready_txt": {
                    "content": "Terminal map ready for the park survey team\n"
                  }
                }
              },
              "module-1-terminal-map-project-terminal-task-2": {
                "title": "Recherchez le dossier « requests »",
                "prompt": "Depuis le répertoire « park-terminal-map », dressez la liste de ce qui s'y trouve, accédez au dossier « requests », puis utilisez la commande « pwd » pour vérifier que vous avez bien trouvé les notes relatives aux demandes.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Une fois que vous êtes dans un dossier, la commande « ls » affiche son contenu et la commande « cd » vous permet de descendre plus bas dans l'arborescence.",
                  "hint_1": "Utilisez la commande « ls » dans « park-terminal-map » avant de choisir votre prochaine destination.",
                  "hint_2": "Exécutez la commande « pwd » après chaque commande « cd » afin de pouvoir vérifier le nom du dossier."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Utilisez la commande « ls » dans « park-terminal-map »."
                    },
                    "1": {
                      "message": "Accédez au dossier « requests »."
                    },
                    "2": {
                      "message": "Lancez la commande « pwd » après avoir saisi vos requêtes."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes de l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "park_terminal_map_requests_north_trail_txt": {
                    "content": "North trail request log\n"
                  },
                  "park_terminal_map_maps_current_location_txt": {
                    "content": "Current location checked with pwd and ls\n"
                  },
                  "park_terminal_map_handoff_terminal_map_ready_txt": {
                    "content": "Terminal map ready for the park survey team\n"
                  }
                }
              },
              "module-1-terminal-map-project-terminal-task-3": {
                "title": "Passer des demandes aux cartes",
                "prompt": "Depuis la page « Demandes », revenez à « park-terminal-map », accédez à la rubrique « Cartes », puis utilisez la commande « pwd » pour vérifier que vous êtes bien arrivé aux notes de navigation.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "cd .. moves you up one level, which is useful when you need to move from one sibling folder to another.",
                  "hint_1": "Avant d'essayer d'accéder aux cartes, saisissez « cd .. ».",
                  "hint_2": "Utilisez la commande « pwd » à la fin pour vérifier que « maps » est bien votre répertoire actuel."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Commencez par remonter d'un niveau avec la commande « cd .. »."
                    },
                    "1": {
                      "message": "Passez ensuite aux cartes."
                    },
                    "2": {
                      "message": "Lancez la commande « pwd » après avoir accédé à « maps »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "park_terminal_map_requests_north_trail_txt": {
                    "content": "North trail request log\n"
                  },
                  "park_terminal_map_maps_current_location_txt": {
                    "content": "Current location checked with pwd and ls\n"
                  },
                  "park_terminal_map_handoff_terminal_map_ready_txt": {
                    "content": "Terminal map ready for the park survey team\n"
                  }
                }
              }
            }
          }
        },
        "moving-around": {
          "label": "Se déplacer avec le CD",
          "summary": "Utilisez les commandes « cd », « .. », « . » et « ~ » pour naviguer en toute sécurité entre les dossiers.",
          "cards": {
            "sketch0": {
              "title": "Quels sont les changements apportés par l'`cd` ?"
            },
            "sketch1": {
              "title": "Sources : `..`, `.` et `~`"
            },
            "sketch2": {
              "title": "Vérifier les voies de circulation en toute sécurité avant de se déplacer"
            },
            "quiz": {
              "title": "Vérification des exercices"
            },
            "project": {
              "title": "Créer une carte de navigation simple pour l'espace de travail d'un client"
            }
          },
          "tryIt": {
            "allowReveal": true,
            "exercises": {
              "moving-around-try-it-1": {
                "title": "Tâche dans le terminal : accéder à un dossier à l'aide de la commande « cd »",
                "prompt": "Vous devez accéder au dossier « `navigation-practice` ». Exécutez les commandes suivantes : « `ls` », puis « `cd navigation-practice` », puis « `pwd` » pour vérifier que le déplacement a bien eu lieu.",
                "hint": "Commencez par publier votre annonce, déménagez ensuite, puis confirmez votre nouvelle adresse auprès de `pwd`.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `ls` » avant de déménager."
                    },
                    "1": {
                      "message": "Exécutez la commande « `cd navigation-practice` »."
                    },
                    "2": {
                      "message": "Après avoir changé de dossier, lancez la commande « `pwd` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "navigation_practice_start_welcome_txt": {
                    "content": "Start folder\n"
                  },
                  "navigation_practice_reports_today_txt": {
                    "content": "Report folder\n"
                  }
                }
              },
              "moving-around-try-it-2": {
                "title": "Tâche dans le terminal : remonter d'un niveau avec « cd .. »",
                "prompt": "Commencez par « `navigation-practice/start` », puis passez au niveau supérieur. Exécutez à nouveau « `cd navigation-practice/start` », « `pwd` », « `cd ..` » et « `pwd` ».",
                "hint": "Après avoir saisi « `cd ..` », la deuxième commande « `pwd` » devrait afficher le dossier parent.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `cd navigation-practice/start` »."
                    },
                    "1": {
                      "message": "Exécutez la commande « `cd ..` » pour remonter d'un dossier."
                    },
                    "2": {
                      "message": "Exécutez la commande « `pwd` » pour vérifier où vous vous trouvez."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "navigation_practice_start_welcome_txt": {
                    "content": "Start folder\n"
                  },
                  "navigation_practice_reports_today_txt": {
                    "content": "Report folder\n"
                  }
                }
              },
              "moving-around-try-it-3": {
                "title": "Tâche finale : rentrer chez soi avec la commande « cd ~ »",
                "prompt": "Revenez de votre dossier imbriqué à votre dossier d'accueil. Relancez les pages `cd navigation-practice/reports`, `pwd`, `cd ~` et `pwd`.",
                "hint": "Utilisez « `~` » comme raccourci vers votre dossier personnel, puis confirmez en saisissant « `pwd` ».",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `cd navigation-practice/reports` »."
                    },
                    "1": {
                      "message": "Exécutez la commande « `cd ~` » pour revenir à la page d'accueil."
                    },
                    "2": {
                      "message": "Exécutez la commande « `pwd` » pour vérifier votre emplacement."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "navigation_practice_start_welcome_txt": {
                    "content": "Start folder\n"
                  },
                  "navigation_practice_reports_today_txt": {
                    "content": "Report folder\n"
                  }
                }
              }
            },
            "try_moving_around_sketch0": {
              "title": "Essayez vous-même : accédez à un dossier à l'aide de la commande « cd »",
              "prompt": "Exécutez la commande « `ls` », puis « `cd navigation-practice` », puis « `pwd` » pour valider la modification du dossier."
            },
            "try_moving_around_sketch1": {
              "title": "Essayez vous-même : remontez d'un niveau avec la commande « cd .. »",
              "prompt": "Relancez les commandes suivantes : ``cd navigation-practice/start``, ``pwd``, ``cd ..`` et ``pwd`` pour vous entraîner à accéder au dossier parent."
            },
            "try_moving_around_sketch2": {
              "title": "Essayez vous-même : retournez à l'accueil avec la commande « cd ~ »",
              "prompt": "Lancez à nouveau les pages `cd navigation-practice/reports`, `pwd`, `cd ~` et `pwd` pour vous entraîner à utiliser le raccourci vers le dossier d'accueil."
            }
          },
          "practice": {
            "q1": {
              "title": "En quoi consiste «`cd`» ?",
              "prompt": "Quelle commande permet de changer de répertoire dans le terminal Linux ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez la question à l'exemple donné dans la leçon et supprimez les détails qui ne correspondent pas au concept demandé.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "cd",
                "c": "ls",
                "d": "cat"
              }
            },
            "moving-around-single-choice-2": {
              "title": "Choisissez la description la plus appropriée",
              "prompt": "Quelle affirmation correspond le mieux à la rubrique « Se déplacer avec un CD » ?",
              "hint": "Choisissez la réponse qui décrit le concept principal de la leçon.",
              "help": {
                "concept": "Cette question permet de vérifier la compréhension de l'idée principale du chapitre « Se déplacer avec un CD ».",
                "hint_1": "Suis les explications données dans la leçon, puis élimine les réponses qui ne correspondent pas à celles-ci.",
                "hint_2": "Choisissez la réponse qui correspond au concept abordé dans le cours, et non un détail pris au hasard."
              },
              "options": {
                "a": "Il décrit le concept principal de la leçon.",
                "b": "Cela n'a aucun rapport avec le sujet du cours.",
                "c": "Cela ne tient pas compte de l'objectif de l'apprenant.",
                "d": "Cela remplace le concept par un raccourci peu sûr."
              }
            },
            "moving-around-multi-choice-1": {
              "title": "Adoptez des habitudes d'apprentissage sûres",
              "prompt": "Quelles sont les bonnes habitudes à adopter pour apprendre ce sujet ?",
              "hint": "Les bonnes habitudes permettent à l'apprenant de rester concentré sur l'objectif de la leçon et sur les résultats concrets.",
              "help": {
                "concept": "Cette question porte sur l'idée principale du chapitre « Se déplacer avec un CD ».",
                "hint_1": "Suis les explications données dans la leçon, puis élimine les réponses qui ne correspondent pas à celles-ci.",
                "hint_2": "Choisissez la réponse qui correspond au concept abordé dans le cours, et non un détail pris au hasard."
              },
              "options": {
                "a": "Lisez attentivement les instructions avant d'agir.",
                "b": "Vérifiez le résultat après avoir effectué une modification",
                "c": "Ne tenez pas compte des noms exacts indiqués dans la tâche",
                "d": "Utiliser des raccourcis sans rapport les uns avec les autres sans les comprendre"
              }
            },
            "moving-around-drag-reorder-1": {
              "title": "Commander un protocole d'entraînement sécurisé",
              "prompt": "Organisez ces étapes d'apprentissage dans un ordre logique.",
              "hint": "Lisez chaque élément et classez-les dans l'ordre dans lequel l'énoncé doit être compris.",
              "help": {
                "concept": "Les éléments doivent former un ensemble cohérent, présenté dans un ordre logique.",
                "hint_1": "Commencez par le passage qui présente l'idée ou l'action.",
                "hint_2": "Placez les pièces liées à un emplacement précis après l'élément qu'elles décrivent ou complètent."
              },
              "tokens": {
                "t1": "Lire l'objectif",
                "t2": "Essayez une étape",
                "t3": "Vérifiez le résultat",
                "t4": "Réfléchissez à ce qui a changé"
              }
            },
            "q2": {
              "title": "Monter d'un niveau",
              "prompt": "Complétez la commande qui permet de passer du dossier actuel à son dossier parent.",
              "hint": "Utilisez le chemin d'accès spécial qui désigne le « dossier parent ».",
              "help": {
                "concept": "Dans les chemins d'accès sous Linux, « `..` » désigne le répertoire situé un niveau au-dessus de votre emplacement actuel.",
                "hint_1": "Il ne s'agit pas ici d'une commande à part entière ; c'est la cible utilisée après « `cd` ».",
                "hint_2": "Le raccourci vers le dossier parent utilise deux points."
              },
              "template": "cd [blank1]",
              "choices": [
                "..",
                ".",
                "~",
                "ls"
              ]
            },
            "q3": {
              "title": "Accéder au dossier d'un projet",
              "prompt": "Un script change de dossier avant d'effectuer d'autres opérations. Que devrait-il faire de plus pour que vous puissiez vérifier qu'il se trouve bien au bon endroit ?",
              "hint": "Recherchez l'option qui permet d'afficher la modification du dossier dans le résultat.",
              "help": {
                "concept": "Une procédure de navigation courante consiste à créer un dossier avec la commande « `mkdir` », à y accéder avec « `cd` », puis à vérifier le nouveau répertoire de travail avec « `pwd` ».",
                "hint_1": "Il faut une commande pour créer le dossier et une autre pour y accéder.",
                "hint_2": "Après avoir saisi « `client-site` », exécutez la commande qui affiche le répertoire de travail actuel afin que la sortie du terminal indique le nouvel emplacement."
              },
              "template": "Un script qui modifie des dossiers devrait également ____ afin que le résultat soit facile à vérifier.",
              "choices": [
                "afficher un résultat observable",
                "masquer toutes les sorties",
                "supprimer le fichier immédiatement",
                "passer le programme"
              ]
            }
          }
        },
        "what-the-terminal-is": {
          "label": "Qu'est-ce que le Terminal ?",
          "summary": "Considérez le terminal comme un endroit où l'on tape des commandes et où l'on voit l'ordinateur y répondre.",
          "cards": {
            "sketch0": {
              "title": "Le terminal, c'est un dialogue avec votre ordinateur"
            },
            "sketch1": {
              "title": "Les commandes sont des instructions, et la sortie correspond à la réponse"
            },
            "sketch2": {
              "title": "Pourquoi les gens utilisent-ils le terminal ?"
            },
            "quiz": {
              "title": "Entraînement"
            }
          },
          "practice": {
            "sc-terminal-purpose": {
              "title": "Fonctionnalités du terminal",
              "prompt": "Vous participez à l'organisation de l'espace de travail d'un club à l'aide de dossiers et de fichiers. Quelle description correspond le mieux au répertoire ?",
              "hint": "Demandez-vous si le terminal est un endroit où l'on tape des commandes ou un espace de stockage de fichiers à part entière.",
              "help": {
                "concept": "Le terminal est une interface permettant de saisir des commandes et de visualiser les réponses de l'ordinateur. Il ne s'agit pas d'un dossier, d'un fichier ou d'un système d'exploitation.",
                "hint_1": "Choisissez l'option qui décrit le mieux cette interaction : vous tapez quelque chose et l'ordinateur répond.",
                "hint_2": "Recherchez l'option qui décrit un outil en mode texte permettant d'exécuter des commandes."
              },
              "options": {
                "a": "Un environnement en mode texte permettant de saisir des commandes et de voir la réaction de l'ordinateur",
                "b": "Un dossier qui enregistre automatiquement tous les fichiers que vous créez",
                "c": "Un fichier spécial qui répertorie toutes les commandes de l'ordinateur",
                "d": "Un processus d'arrière-plan qui s'exécute sans intervention de l'utilisateur"
              }
            },
            "sc-pwd-vs-ls": {
              "title": "Choisissez l'objectif de commande approprié",
              "prompt": "Un apprenant tape une commande car il souhaite savoir dans quel dossier il se trouve actuellement avant d'afficher la liste des fichiers. Quelle commande correspond à cet objectif ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez la question à l'exemple donné dans la leçon et supprimez les détails qui ne correspondent pas au concept demandé.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "ls",
                "c": "cat",
                "d": "touch"
              }
            },
            "mc-terminal-workflow": {
              "title": "Quels sont les éléments indispensables d'un flux de travail de base dans un terminal ?",
              "prompt": "Sélectionnez toutes les actions qui correspondent à l'idée d'utiliser le terminal pour vérifier en toute sécurité un espace de travail au début d'une tâche.",
              "hint": "Réfléchissez aux commandes qui vous permettent de vérifier votre emplacement et de voir ce que contient le dossier actuel.",
              "help": {
                "concept": "Les premières étapes d'un workflow en terminal commencent souvent par des commandes d'inspection telles que « `pwd` » et « `ls` », afin que vous puissiez vous faire une idée de votre emplacement actuel et du contenu avant d'effectuer des modifications.",
                "hint_1": "Recherchez les actions qui vous aident à vous repérer avant de créer, déplacer ou supprimer quoi que ce soit.",
                "hint_2": "Deux de ces options permettent d'accéder directement à ces informations : l'une affiche le dossier dans lequel vous vous trouvez actuellement, et l'autre répertorie les éléments qu'il contient."
              },
              "options": {
                "a": "Exécutez la commande « `pwd` » pour vérifier le dossier actuel.",
                "b": "Exécutez la commande « `ls` » pour afficher les fichiers et dossiers de l'emplacement actuel.",
                "c": "Utilisez « `sudo` » pour prendre le contrôle total avant de cocher quoi que ce soit",
                "d": "Installez un paquet pour que le terminal puisse afficher les noms des dossiers"
              }
            },
            "dr-terminal-check-sequence": {
              "title": "Demander un simple contrôle du terminal",
              "prompt": "Classez ces étapes dans l'ordre le plus approprié pour un débutant qui ouvre le terminal et souhaite se familiariser avec l'environnement de travail avant toute autre chose.",
              "hint": "Lisez chaque élément et classez-les dans l'ordre dans lequel l'énoncé doit être compris.",
              "help": {
                "concept": "Les éléments doivent former un ensemble cohérent, présenté dans un ordre logique.",
                "hint_1": "Commencez par le passage qui présente l'idée ou l'action.",
                "hint_2": "Placez les pièces liées à un emplacement précis après l'élément qu'elles décrivent ou complètent."
              },
              "tokens": {
                "t1": "Ouvrez le terminal",
                "t2": "Exécutez la commande « `pwd` »",
                "t3": "Exécutez la commande « `ls` »"
              }
            },
            "fb-pwd-meaning": {
              "title": "Complétez la signification de la commande",
              "prompt": "Complétez la commande manquante dans cette situation : vous souhaitez que le terminal affiche l'emplacement de votre dossier actuel.",
              "hint": "Choisissez la commande qui affiche le répertoire de travail.",
              "help": {
                "concept": "`the missing term` est la commande qui permet d'afficher le répertoire de travail actuel dans le terminal.",
                "hint_1": "Cette commande est l'abréviation de « print working directory » (afficher le répertoire de travail).",
                "hint_2": "C'est la commande à utiliser lorsque vous voulez que le terminal réponde à la question « Où suis-je ? »"
              },
              "template": "Pour afficher l'emplacement du dossier dans lequel vous vous trouvez actuellement, tapez « `[blank1]` ».",
              "choices": [
                "pwd",
                "ls",
                "cat",
                "mkdir"
              ]
            },
            "fb-ls-purpose": {
              "title": "Précisez l'objectif de la commande",
              "prompt": "Complétez la commande manquante dans cette situation : vous vous trouvez dans un dossier de projet et vous souhaitez afficher les noms des fichiers et des dossiers qu'il contient.",
              "hint": "Choisissez la commande qui affiche la liste des éléments du répertoire actuel.",
              "help": {
                "concept": "`the missing term` affiche le contenu du répertoire actuel, notamment les fichiers et les dossiers.",
                "hint_1": "Cette commande vous aide à répondre à la question « Qu'y a-t-il ici ? »",
                "hint_2": "Ce n'est pas la commande qui permet d'afficher votre position ; c'est celle qui permet d'afficher la liste des noms."
              },
              "template": "Pour afficher la liste des noms des fichiers et des dossiers du répertoire actuel, tapez « `[blank1]` ».",
              "choices": [
                "pwd",
                "touch",
                "ls",
                "mv"
              ]
            }
          },
          "tryIt": {
            "exercises": {
              "what-the-terminal-is-try-it-1": {
                "prompt": "Vous venez de créer un espace de travail partagé. Lancez la commande « `pwd` » pour voir où vous en êtes.",
                "title": "Tâche du terminal : exécuter pwd",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `pwd` » pour afficher le répertoire de travail actuel."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "terminal_tour_location_readme_txt": {
                    "content": "Run pwd to ask the terminal where you are.\n"
                  }
                }
              },
              "what-the-terminal-is-try-it-2": {
                "title": "Tâche du terminal : exécuter la commande « ls »",
                "prompt": "Jetez un coup d'œil rapide autour de vous. Exécutez la commande « `ls` » pour voir ce que contient le dossier actuel.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `ls` » pour afficher la liste des fichiers et dossiers contenus dans le dossier actuel."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "terminal_tour_notes_txt": {
                    "content": "notes\n"
                  },
                  "terminal_tour_photos_readme_txt": {
                    "content": "photo folder\n"
                  }
                }
              },
              "what-the-terminal-is-try-it-3": {
                "title": "Tâche finale : demander où et quoi",
                "prompt": "Avant de modifier quoi que ce soit, commencez par vous familiariser avec le système. Exécutez d'abord la commande « `pwd` », puis « `ls` ».",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Lancez d'abord la commande « `pwd` »."
                    },
                    "1": {
                      "message": "Exécutez la commande « `ls` » après avoir changé de répertoire."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "event_plan_schedule_txt": {
                    "content": "10:00 setup\n"
                  },
                  "event_plan_guests_txt": {
                    "content": "Guests\n"
                  }
                }
              }
            },
            "try_what_the_terminal_is_sketch0": {
              "title": "Essayez vous-même : lancez la commande « pwd »",
              "prompt": "Exécutez la commande « `pwd` » pour afficher le dossier dans lequel vous vous trouvez actuellement."
            },
            "try_what_the_terminal_is_sketch1": {
              "title": "Essayez vous-même : lancez la commande « ls »",
              "prompt": "Exécutez la commande « `ls` » pour afficher la liste des fichiers et dossiers contenus dans le dossier actuel."
            },
            "try_what_the_terminal_is_sketch2": {
              "title": "Essayez vous-même : lancez la commande « pwd », puis « ls »",
              "prompt": "Exécutez la commande « `pwd` », puis « `ls` », pour connaître votre position avant de commencer à travailler."
            }
          }
        },
        "where-am-i": {
          "label": "« Où suis-je ? » pwd et ls",
          "summary": "Utilisez les commandes `pwd` et `ls` pour examiner le répertoire dans lequel vous vous trouvez et voir ce qu'il contient.",
          "cards": {
            "sketch0": {
              "title": "Utilisez `pwd` pour localiser votre position actuelle"
            },
            "sketch1": {
              "title": "Utilisez la commande « `ls` » pour afficher le contenu du dossier actuel."
            },
            "sketch2": {
              "title": "Utilisez conjointement les sites `pwd` et `ls` pour vous repérer"
            },
            "quiz": {
              "title": "Vérification des exercices"
            }
          },
          "practice": {
            "sc-pwd-purpose": {
              "title": "Ce que vous apprend « `pwd` »",
              "prompt": "Vous organisez les fichiers d'un club étudiant et souhaitez vérifier le dossier dans lequel vous vous trouvez avant de faire quoi que ce soit d'autre. Quelle commande permet d'afficher votre emplacement actuel dans le système de fichiers ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez la question à l'exemple donné dans la leçon et supprimez les détails qui ne correspondent pas au concept demandé.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "ls",
                "c": "cd",
                "d": "touch"
              }
            },
            "sc-ls-purpose": {
              "title": "Ce que montre « `ls` »",
              "prompt": "Vous vous trouvez dans un dossier nommé « `newsletter` » et vous souhaitez vérifier s'il contient les fichiers « `drafts` », « `images` » et « `todo.txt` ». Quelle commande devez-vous utiliser ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez chaque option au sujet précis mentionné dans la question.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "mkdir",
                "c": "ls",
                "d": "mv"
              }
            },
            "mc-safe-inspection": {
              "title": "Commandes d'inspection de sécurité",
              "prompt": "Sélectionnez toutes les commandes ci-dessous qui permettent de vérifier le contenu de votre emplacement ou de votre dossier sans créer, déplacer ni supprimer de fichiers.",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez chaque option au sujet précis mentionné dans la question.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "ls",
                "c": "mkdir",
                "d": "cd"
              }
            },
            "dr-orient-yourself": {
              "title": "Une bonne procédure de vérification initiale",
              "prompt": "Organisez ces étapes dans un ordre logique afin de vous familiariser avec un nouveau dossier de travail avant d'y apporter des modifications.",
              "hint": "Commencez par vérifier l'emplacement, puis examinez le contenu, et décidez ensuite de la marche à suivre.",
              "help": {
                "concept": "Une méthode sûre pour les débutants consiste à identifier d'abord le répertoire dans lequel vous vous trouvez, à en examiner le contenu ensuite, puis à choisir seulement après cela l'action suivante.",
                "hint_1": "La commande qui affiche votre chemin d'accès doit précéder celle qui répertorie les fichiers.",
                "hint_2": "La dernière étape ne consiste pas ici à donner une autre commande ; il s'agit de prendre une décision en vous appuyant sur ce que vous avez appris."
              },
              "tokens": {
                "t1": "Exécutez la commande « `pwd` »",
                "t2": "Exécutez la commande « `ls` »",
                "t3": "Choisissez votre prochaine commande"
              }
            },
            "fb-pwd-expansion": {
              "title": "Développer le nom de la commande",
              "prompt": "Complétez la phrase concernant « `pwd` ».",
              "hint": "L'`w`, dans « `pwd` », fait référence au répertoire que vous utilisez actuellement.",
              "help": {
                "concept": "`pwd` signifie « imprimer le répertoire des termes manquants ». Connaître l'expression complète permet de faire le lien entre le nom de la commande et sa fonction.",
                "hint_1": "Le mot manquant se trouve entre « print » et « directory ».",
                "hint_2": "Il s'agit du répertoire dans lequel vous vous trouvez actuellement."
              },
              "template": "`pwd` signifie « imprimer le répertoire [blank1] ».",
              "choices": [
                "Accueil",
                "en cours",
                "parent",
                "répertorié"
              ]
            },
            "fb-ls-meaning": {
              "title": "Choisissez la commande adaptée au contenu",
              "prompt": "Complétez la ligne de commande permettant de vérifier le contenu du dossier actuel.",
              "hint": "Utilisez la commande qui affiche la liste des noms dans le répertoire actuel.",
              "help": {
                "concept": "`the missing term` C'est la commande qui permet d'afficher le contenu du répertoire actuel. Elle vous permet de consulter les fichiers et les dossiers sans les modifier.",
                "hint_1": "Ce n'est pas la commande qui affiche le chemin d'accès complet.",
                "hint_2": "La commande correcte comporte deux lettres et commence par « `l` »."
              },
              "template": "Pour afficher les fichiers et dossiers du répertoire actuel, exécutez la commande « `[blank1]` ».",
              "choices": [
                "pwd",
                "ls",
                "cd",
                "mkdir"
              ]
            }
          },
          "tryIt": {
            "allowReveal": true,
            "exercises": {
              "where-am-i-try-it-1": {
                "title": "Tâche dans le terminal : vérifiez votre emplacement à l'aide de la commande « pwd »",
                "prompt": "Vous venez d'ouvrir un dossier de projet. Exécutez la commande « `pwd` » pour vérifier votre emplacement actuel.",
                "hint": "Exécutez la commande indiquée dans l'invite. Il n'est pas nécessaire de créer ou de modifier des fichiers à ce stade.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `pwd` » pour afficher le dossier actuel."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "orientation_demo_readme_txt": {
                    "content": "Use pwd to print your current folder.\n"
                  }
                }
              },
              "where-am-i-try-it-2": {
                "title": "Exercice sur le terminal : afficher la liste des fichiers du dossier actuel avec la commande « ls »",
                "prompt": "Vous êtes sur le point de commencer à travailler dans ce dossier. Exécutez la commande « `ls` » pour voir ce qu’il contient déjà.",
                "hint": "Exécutez la commande indiquée dans l'invite. Cette tâche consiste simplement à vérifier ce qui est déjà présent.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `ls` » pour afficher la liste des fichiers du dossier actuel."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "orientation_demo_notes_txt": {
                    "content": "orientation notes\n"
                  },
                  "orientation_demo_archive_readme_txt": {
                    "content": "archive folder\n"
                  }
                }
              },
              "where-am-i-try-it-3": {
                "title": "Exercice sur le terminal : s'orienter à l'aide des commandes `pwd` et `ls`",
                "prompt": "Commencez par vous comporter comme un coéquipier prudent. Exécutez les commandes « `pwd` », puis « `ls` », afin de vous repérer avant d'effectuer des modifications.",
                "hint": "Commencez par utiliser `pwd`, puis `ls`, comme indiqué dans l'invite.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `pwd` » avant d'afficher la liste des fichiers."
                    },
                    "1": {
                      "message": "Exécutez la commande « `ls` » après avoir changé de répertoire."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "reports_summary_txt": {
                    "content": "weekly summary\n"
                  },
                  "reports_archive_readme_txt": {
                    "content": "archive\n"
                  }
                }
              }
            },
            "try_where_am_i_sketch0": {
              "title": "Essayez vous-même : vérifiez votre position avec la commande « pwd »",
              "prompt": "Exécutez la commande « `pwd` » pour afficher le dossier dans lequel vous vous trouvez actuellement."
            },
            "try_where_am_i_sketch1": {
              "title": "Essayez vous-même : affichez le contenu du dossier actuel avec la commande « ls »",
              "prompt": "Exécutez la commande « `ls` » pour afficher le contenu du dossier actuel."
            },
            "try_where_am_i_sketch2": {
              "title": "Essayez vous-même : utilisez les commandes `pwd` et `ls` pour vous repérer",
              "prompt": "Lancez `pwd`, puis `ls`, pour vérifier votre localisation et les fichiers disponibles à proximité avant de commencer."
            }
          }
        }
      },
      "linux-module-2-files-and-folders": {
        "copy-move-rename": {
          "label": "Copier, déplacer et renommer",
          "summary": "Utilisez les commandes `cp` et `mv` pour copier, organiser et renommer des fichiers en toute sécurité.",
          "cards": {
            "sketch0": {
              "title": "Copier des fichiers avec cp"
            },
            "sketch1": {
              "title": "Déplacer des fichiers et des dossiers avec la commande mv"
            },
            "sketch2": {
              "title": "Renommer avec mv"
            },
            "quiz": {
              "title": "Vérification des exercices"
            },
            "project": {
              "title": "Organiser les dossiers d'étude d'un élève"
            }
          },
          "tryIt": {
            "allowReveal": true,
            "exercises": {
              "copy-move-rename-try-it-1": {
                "title": "Tâche du terminal : copier avec cp",
                "prompt": "Le dossier de destination existe déjà. Utilisez la commande « `cp` » pour copier le fichier « `sample-inbox/agenda.txt` » vers « `warmup/backups/agenda.txt` » tout en conservant l'original.",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « cp » indiquée dans l'invite de commande."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "sample_inbox_agenda_txt": {
                    "content": "Agenda\n"
                  },
                  "warmup_backups_keep": {
                    "content": ""
                  }
                }
              },
              "copy-move-rename-try-it-2": {
                "title": "Tâche dans le terminal : déplacer avec mv",
                "prompt": "Le dossier de destination existe déjà. Utilisez la commande « `mv` » pour déplacer le fichier « `sample-inbox/guest-list.txt` » vers « `warmup/guests/guest-list.txt` ».",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « mv » indiquée dans l'invite de commande."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "sample_inbox_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "warmup_guests_keep": {
                    "content": ""
                  }
                }
              },
              "copy-move-rename-try-it-3": {
                "title": "Tâche dans le terminal : renommer avec la commande « mv »",
                "prompt": "Utilisez le fichier « `mv` » pour renommer « `sample-inbox/draft-report.txt` » en « `sample-inbox/final-report.txt` » dans le même dossier.",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de vous exercer à utiliser la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « mv » suivie du nom de fichier à renommer, comme indiqué dans l'invite de commande."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "sample_inbox_draft_report_txt": {
                    "content": "Draft report\n"
                  }
                }
              }
            },
            "try_copy_move_rename_sketch0": {
              "title": "Essayez vous-même : copiez avec la commande « cp »",
              "prompt": "Exécutez la commande « `cp sample-inbox/agenda.txt warmup/backups/agenda.txt` » pour vous entraîner à copier un fichier tout en conservant l'original."
            },
            "try_copy_move_rename_sketch1": {
              "title": "Essayez vous-même : déplacez-vous avec mv",
              "prompt": "Exécutez la commande « `mv sample-inbox/guest-list.txt warmup/guests/guest-list.txt` » pour vous entraîner à déplacer un fichier."
            },
            "try_copy_move_rename_sketch2": {
              "title": "Essayez vous-même : renommer un fichier avec la commande « mv »",
              "prompt": "Exécutez la commande « `mv sample-inbox/draft-report.txt sample-inbox/final-report.txt` » pour vous entraîner à renommer des fichiers avec la commande « mv »."
            }
          },
          "practice": {
            "sc-which-command-renames": {
              "title": "Identifier la commande de renommage",
              "prompt": "Quelle commande permet de renommer « `plan.txt` » en « `project-plan.txt` » dans le même dossier ?",
              "hint": "Pour renommer un fichier, on utilise la même commande que pour le déplacer.",
              "help": {
                "concept": "Linux utilise la commande « `mv` » aussi bien pour déplacer qu'en renommer un fichier, car ces deux opérations modifient le chemin d'accès du fichier.",
                "hint_1": "Une commande de copie laisserait deux fichiers, ce qui n'est pas le cas d'un changement de nom.",
                "hint_2": "Choisissez la commande qui permet de remplacer directement l'ancien nom par le nouveau."
              },
              "options": {
                "a": "cp plan.txt project-plan.txt",
                "b": "mv plan.txt project-plan.txt",
                "c": "ls plan.txt project-plan.txt",
                "d": "cat plan.txt project-plan.txt"
              }
            },
            "mc-copy-vs-move": {
              "title": "Choisissez les affirmations vraies concernant les commandes « cp » et « mv ».",
              "prompt": "Quelles affirmations sont correctes ? Sélectionnez toutes les réponses qui s'appliquent.",
              "hint": "Une commande permet de dupliquer un fichier, tandis que l'autre permet de modifier son emplacement ou son nom.",
              "help": {
                "concept": "`cp` crée une copie supplémentaire, tandis que la commande « `mv` » modifie le chemin d'accès du fichier, de sorte que son emplacement ou son nom d'origine ne reste plus le même.",
                "hint_1": "Recherchez les instructions qui correspondent à ce qui arrive au fichier d'origine après chaque commande.",
                "hint_2": "La bonne réponse doit décrire soit un doublon avec `cp`, soit relocation/renaming avec `mv`."
              },
              "options": {
                "a": "`cp notes.txt backup.txt` conserve l'adresse `notes.txt` et crée l'adresse `backup.txt`.",
                "b": "`mv draft.txt final.txt` Il est possible de renommer un fichier situé dans le même dossier.",
                "c": "`cp report.txt archive/` supprime le fichier « `report.txt` » de son dossier d'origine.",
                "d": "`mv essay.txt folder/` crée deux copies de « `essay.txt` »."
              }
            },
            "mc-safe-command-choice": {
              "title": "Choisissez les commandes qui correspondent à l'objectif",
              "prompt": "Vous souhaitez conserver le fichier d'origine `notes.txt` et créer une autre version sous un nom différent. Quelles commandes vous permettraient d'atteindre cet objectif ? Sélectionnez toutes les réponses qui s'appliquent.",
              "hint": "Il vous faut des commandes qui copient, et non qui déplacent.",
              "help": {
                "concept": "Si vous souhaitez conserver le fichier d'origine, utilisez la commande `cp`. Une opération de renommage ou de déplacement effectuée avec la commande `mv` modifie le chemin d'accès d'origine au lieu de le conserver.",
                "hint_1": "Toute commande correcte doit permettre à `notes.txt` de continuer d'exister après son exécution.",
                "hint_2": "Recherchez les commandes « `cp` » qui utilisent « `notes.txt` » comme source et un chemin ou un nom de destination différent."
              },
              "options": {
                "a": "`cp notes.txt notes-copy.txt`",
                "b": "`mv notes.txt notes-copy.txt`",
                "c": "`cp notes.txt backups/notes.txt`",
                "d": "`mv notes.txt backups/`"
              }
            },
            "dr-copy-then-rename-flow": {
              "title": "Définir le flux de travail des fichiers",
              "prompt": "Classez ces étapes dans l'ordre correct pour créer une copie de sauvegarde de `outline.txt`, puis renommer cette copie `outline-final.txt`.",
              "hint": "Commencez par créer une copie, puis renommez-la.",
              "help": {
                "concept": "Le déroulement d'une opération sur plusieurs étapes dépend de ce qui se passe après chaque commande. Vous ne pouvez pas renommer le fichier copié tant que la copie n'a pas été créée.",
                "hint_1": "Le fichier de sauvegarde doit déjà exister pour pouvoir être renommé.",
                "hint_2": "Commencez par le fichier d'origine, créez une copie, puis renommez ce fichier copié."
              },
              "tokens": {
                "t1": "Commencez par le fichier « `outline.txt` » qui se trouve dans le dossier.",
                "t2": "Exécutez la commande « `cp outline.txt outline-copy.txt` ».",
                "t3": "Exécutez la commande « `mv outline-copy.txt outline-final.txt` ».",
                "t4": "Terminez par les deux adresses suivantes : `outline.txt` et `outline-final.txt`."
              }
            },
            "ci-copy-class-notes": {
              "title": "Copier un fichier de notes de cours",
              "prompt": "Il est recommandé de faire une sauvegarde avant de modifier vos notes de cours. Quelle réponse montre que la commande « `cp` » a été utilisée correctement ?",
              "hint": "Utilisez d'abord « `cp` », en indiquant d'abord le nom du fichier d'origine, puis celui de la sauvegarde.",
              "help": {
                "concept": "`cp` duplique un fichier. Le fichier source reste à sa place, et un nouveau fichier est créé à l'emplacement de destination.",
                "hint_1": "À la fin, vous devez disposer de deux fichiers : le fichier d'origine « `class-notes.txt` » et un nouveau fichier « `class-notes-backup.txt` ».",
                "hint_2": "Exécutez une commande de copie où `class-notes.txt` correspond au nom de la source et `class-notes-backup.txt` à celui de la destination."
              },
              "template": "Une procédure de sauvegarde correcte devrait ____ afin que vous puissiez voir à la fois l'original et la copie.",
              "choices": [
                "afficher un résultat observable",
                "masquer toutes les sorties",
                "supprimer le fichier immédiatement",
                "passer le programme"
              ]
            },
            "ci-move-report-into-folder": {
              "title": "Déplacer un rapport dans le dossier approprié",
              "prompt": "Un rapport doit se trouver dans « `submissions` », et non dans le dossier actuel. Quel résultat montre que « `mv` » a été utilisé correctement ?",
              "hint": "Utilisez la commande « `mv` » en indiquant le nom du fichier et le dossier de destination.",
              "help": {
                "concept": "`mv` déplace un fichier ou un dossier. Une fois déplacé, l'élément se trouve désormais à son nouvel emplacement et non plus à l'ancien.",
                "hint_1": "Le dossier de destination existe déjà ; vous n'avez donc pas besoin de le créer.",
                "hint_2": "Déplacez `report.txt` afin que le chemin d'accès final devienne `submissions/report.txt`."
              },
              "template": "Après avoir déplacé un fichier, le mieux est de ____ afin de voir où il se trouve désormais.",
              "choices": [
                "afficher un résultat observable",
                "masquer toutes les sorties",
                "supprimer le fichier immédiatement",
                "passer le programme"
              ]
            }
          }
        },
        "creating-folders-and-files": {
          "label": "Création de dossiers et de fichiers",
          "summary": "Utilisez les commandes `mkdir`, `mkdir -p` et `touch` pour créer une structure de projet bien organisée dans le terminal Linux.",
          "cards": {
            "sketch0": {
              "title": "Créer un dossier à l'aide de la commande mkdir"
            },
            "sketch1": {
              "title": "Créer des dossiers imbriqués avec mkdir -p"
            },
            "sketch2": {
              "title": "Créer des fichiers vides avec la commande « touch »"
            },
            "quiz": {
              "title": "Vérification des exercices"
            },
            "project": {
              "title": "Organiser l'espace de travail de Maya"
            }
          },
          "tryIt": {
            "allowReveal": true,
            "exercises": {
              "creating-folders-and-files-try-it-1": {
                "title": "Tâche dans le terminal : créer un dossier à l'aide de la commande `mkdir`",
                "prompt": "Créez un dossier pour vos notes de cours. Lancez l'`mkdir school-notes`.",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `mkdir school-notes` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                }
              },
              "creating-folders-and-files-try-it-2": {
                "title": "Tâche dans le terminal : créer des dossiers imbriqués avec la commande `mkdir -p`",
                "prompt": "Créez une structure de projet simple. Exécutez la commande « `mkdir -p project-kit/src project-kit/docs` ».",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `mkdir -p project-kit/src project-kit/docs` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes de l'espace de travail."
                    }
                  }
                }
              },
              "creating-folders-and-files-try-it-3": {
                "title": "Tâche dans le terminal : créer des fichiers vides avec la commande « touch »",
                "prompt": "Le dossier « `touch-lab` » est prêt à accueillir deux fichiers de planification. Exécutez « `touch touch-lab/todo.txt touch-lab/agenda.txt` ».",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `touch touch-lab/todo.txt touch-lab/agenda.txt` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "touch_lab_readme_txt": {
                    "content": "This folder is ready for touch practice.\n"
                  }
                }
              }
            },
            "try_creating_folders_and_files_sketch0": {
              "title": "Essayez vous-même : créez un dossier à l'aide de la commande `mkdir`",
              "prompt": "Exécutez la commande « `mkdir school-notes` » pour créer un dossier."
            },
            "try_creating_folders_and_files_sketch1": {
              "title": "Essayez vous-même : créez des dossiers imbriqués avec la commande `mkdir -p`",
              "prompt": "Exécutez la commande « `mkdir -p project-kit/src project-kit/docs` » pour créer des dossiers imbriqués en une seule étape."
            },
            "try_creating_folders_and_files_sketch2": {
              "title": "Essayez vous-même : créez des fichiers vides avec la commande « touch »",
              "prompt": "Exécutez la commande « `touch touch-lab/todo.txt touch-lab/agenda.txt` » pour ajouter deux fichiers vides au dossier existant."
            }
          },
          "practice": {
            "sc-mkdir-basic-purpose": {
              "title": "Identifier l'objectif de la commande",
              "prompt": "Quelle est la fonction principale de la commande « `mkdir` » dans le terminal Linux ?",
              "hint": "Demandez-vous si l'opération crée un dossier, crée un fichier ou affiche des éléments existants.",
              "help": {
                "concept": "`mkdir` signifie « créer un répertoire », et un répertoire est un autre nom pour désigner un dossier.",
                "hint_1": "Cette commande modifie la structure de l'espace de travail en ajoutant un conteneur destiné à accueillir des fichiers.",
                "hint_2": "Il n'affiche pas de contenu et ne crée pas de fichier texte classique."
              },
              "options": {
                "a": "Créer un nouveau dossier",
                "b": "Créer un fichier vide",
                "c": "Afficher la liste des fichiers du dossier actuel",
                "d": "Déplacer vers un autre dossier"
              }
            },
            "mc-when-to-use-mkdir-p": {
              "title": "Choisissez les meilleures utilisations de la commande « mkdir -p »",
              "prompt": "Quelles commandes utilisent correctement la fonction « `mkdir -p` » pour créer des dossiers imbriqués dans le cadre d'un projet de classe ? Sélectionnez toutes les réponses qui s'appliquent.",
              "hint": "Recherchez les commandes qui créent un chemin d'accès incluant les dossiers parents.",
              "help": {
                "concept": "`mkdir -p` est utilisé lorsque vous souhaitez créer un chemin d'accès complet à un dossier, y compris les dossiers parents qui n'existent peut-être pas encore.",
                "hint_1": "Un chemin imbriqué contient des barres obliques, comme par exemple `course/week1/notes`.",
                "hint_2": "Choisissez les commandes qui permettent de créer plusieurs niveaux de dossiers en toute sécurité à l'aide d'une seule commande."
              },
              "options": {
                "a": "mkdir -p school/math/week1",
                "b": "mkdir -p reports/drafts",
                "c": "touch -p school/math/week1",
                "d": "mkdir school/math/week1"
              }
            },
            "mc-valid-project-setup": {
              "title": "Sélectionnez les commandes qui permettent de configurer correctement les fichiers et les dossiers",
              "prompt": "Vous lancez un projet de lecture. Quelles commandes permettraient de créer correctement les éléments demandés ? Sélectionnez toutes les réponses qui s'appliquent.",
              "hint": "Recherchez les commandes correspondant au type d'élément : une commande pour les dossiers, une autre pour les fichiers.",
              "help": {
                "concept": "Utilisez `mkdir` ou `mkdir -p` pour les dossiers, et `touch` pour les fichiers. L'idée principale est d'adapter la commande au type d'élément.",
                "hint_1": "Un dossier tel que « `reading` » nécessite une commande de répertoire.",
                "hint_2": "Un fichier tel que « `reading/list.txt` » peut être créé à l'aide de la commande « `touch` » dès lors que le chemin d'accès au dossier existe, ou en utilisant un chemin d'accès complet après avoir créé le dossier."
              },
              "options": {
                "a": "mkdir reading",
                "b": "touch reading/list.txt",
                "c": "mkdir -p reading/week1",
                "d": "touch week1"
              }
            },
            "dr-folder-setup-order": {
              "title": "Séquence des étapes d'installation",
              "prompt": "Organisez ces commandes Terminal dans un ordre logique pour créer un nouvel espace de travail Notes et le valider.",
              "hint": "Créez le dossier avant d'y accéder, puis créez le fichier une fois que vous vous trouvez dans ce dossier.",
              "help": {
                "concept": "Une procédure sûre à suivre dans le terminal consiste à créer un dossier, à y accéder si nécessaire, à y créer des fichiers, puis à vérifier le résultat.",
                "hint_1": "Vous ne pouvez pas créer « `todo.txt` » dans « `notes` » tant que « `notes` » n'existe pas ou que vous n'avez pas spécifié un chemin d'accès complet.",
                "hint_2": "L'étape de vérification doit être effectuée à la fin, une fois que le dossier et le fichier ont été créés."
              },
              "tokens": {
                "t1": "mkdir notes",
                "t2": "cd notes",
                "t3": "touch todo.txt",
                "t4": "ls"
              }
            },
            "ci-create-single-folder": {
              "title": "Créer un dossier de projet",
              "prompt": "Vous avez créé un dossier « `projects` » dans le terminal et vous souhaitez vérifier que cela a bien fonctionné. Quelle action suivante permet de visualiser le résultat ?",
              "hint": "Choisissez l'action qui affichera le nouveau dossier une fois que vous l'aurez créé.",
              "help": {
                "concept": "`mkdir` crée un dossier dans le répertoire courant, et la commande « `ls` » permet de vérifier rapidement que ce dossier apparaît désormais dans l'espace de travail.",
                "hint_1": "Créez exactement un dossier nommé « `projects` » à l'emplacement où vous vous trouvez actuellement.",
                "hint_2": "Après avoir créé `projects`, exécutez une commande de liste dans le même répertoire afin que l'outil de vérification puisse constater que vous l'avez validé."
              },
              "template": "Une fois le dossier créé, il est utile de ____ afin de pouvoir vérifier la modification.",
              "choices": [
                "afficher un résultat observable",
                "masquer toutes les sorties",
                "supprimer le fichier immédiatement",
                "passer le programme"
              ]
            },
            "fb-touch-purpose": {
              "title": "Complétez l'idée de commande",
              "prompt": "Complétez la commande manquante afin que la phrase corresponde au comportement du terminal Linux.",
              "hint": "Utilisez la commande qui crée un fichier vide s'il n'existe pas encore.",
              "help": {
                "concept": "`the missing term` est couramment utilisé pour créer rapidement des fichiers vides depuis le terminal.",
                "hint_1": "Cette commande s'applique aux fichiers, et non aux dossiers.",
                "hint_2": "C'est la commande que vous utiliseriez pour des sites comme `notes.txt` ou `todo.txt`."
              },
              "template": "Pour créer un fichier vide nommé « `notes.txt` », utilisez la commande « `[blank1] notes.txt` ».",
              "choices": [
                "mkdir",
                "touch",
                "ls",
                "cd"
              ]
            }
          }
        },
        "module-2-notes-organizer-project": {
          "label": "Projet : Organisateur de notes",
          "summary": "Organisez un dossier en désordre en différentes catégories (notes, devoirs, code et sauvegardes) à l'aide des commandes de base du terminal Linux.",
          "cards": {
            "sketch0": {
              "title": "Résumé de l'organisateur des notes du groupe d'étude"
            },
            "project": {
              "title": "Organisateur de notes de groupe d'étude"
            }
          },
          "moduleProject": {
            "steps": {
              "module-2-notes-organizer-project-terminal-task-1": {
                "title": "Créer les dossiers de réception des notes",
                "prompt": "Un groupe d'étude va déposer deux fichiers de notes brutes à trier. Créez les dossiers `student-notes-organizer/inbox/math.txt` et `student-notes-organizer/inbox/history.txt` afin que les deux notes soient prêtes dans le dossier de réception.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                }
              },
              "module-2-notes-organizer-project-terminal-task-2": {
                "title": "Trier les notes et créer une sauvegarde",
                "prompt": "Le groupe d'étude souhaite que les notes soient classées avant le transfert. Déplacez les fichiers `math.txt` et `history.txt` du dossier `student-notes-organizer/inbox` vers le dossier `student-notes-organizer/classes`, puis effectuez une copie de sauvegarde du fichier `history.txt` à l'adresse `student-notes-organizer/backups/history.txt`.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "student_notes_organizer_inbox_math_txt": {
                    "content": "Math review notes\n"
                  },
                  "student_notes_organizer_inbox_history_txt": {
                    "content": "History reading notes\n"
                  }
                }
              },
              "module-2-notes-organizer-project-terminal-task-3": {
                "title": "Finaliser le transfert de l'organisateur",
                "prompt": "Les notes sont classées et sauvegardées. Laissez une indication claire pour la passation de relais en créant un fichier « `student-notes-organizer/handoff/notes-ready.txt` », tout en conservant les notes de cours et leur sauvegarde à leur place.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "student_notes_organizer_classes_math_txt": {
                    "content": "Math review notes\n"
                  },
                  "student_notes_organizer_classes_history_txt": {
                    "content": "History reading notes\n"
                  },
                  "student_notes_organizer_backups_history_txt": {
                    "content": "History reading notes\n"
                  }
                }
              }
            }
          }
        },
        "viewing-file-contents": {
          "label": "Affichage du contenu d'un fichier",
          "summary": "Examinez les fichiers texte à l'aide des commandes `cat`, `head`, `tail` et `wc`.",
          "cards": {
            "sketch0": {
              "title": "Lire un fichier entier avec cat"
            },
            "sketch1": {
              "title": "Prévisualiser le début ou la fin avec « head » et « tail »"
            },
            "sketch2": {
              "title": "Compter les lignes, les mots et les caractères avec wc"
            },
            "quiz": {
              "title": "Vérification des exercices"
            },
            "project": {
              "title": "Vérifier les fichiers pour s'assurer que l'espace de travail scolaire a été nettoyé"
            }
          },
          "tryIt": {
            "allowReveal": true,
            "exercises": {
              "viewing-file-contents-try-it-1": {
                "title": "Tâche dans le terminal : lire un fichier avec cat",
                "prompt": "Pour consulter le menu complet, lancez la commande « `cat cafe/menu.txt` » dans le terminal.",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `cat cafe/menu.txt` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "cafe_menu_txt": {
                    "content": "Soup\nSalad\nTea\n"
                  }
                }
              },
              "viewing-file-contents-try-it-2": {
                "title": "Tâche du terminal : aperçu avec le début et la fin",
                "prompt": "Pour prévisualiser le fichier journal, exécutez la commande « `head logs/event.log` », puis « `tail logs/event.log` ».",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `head logs/event.log` »."
                    },
                    "1": {
                      "message": "Exécutez la commande « `tail logs/event.log` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes de l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "logs_event_log": {
                    "content": "setup started\nchairs placed\nsnacks delivered\ndoors opened\nguests arrived\ncleanup planned\n"
                  }
                }
              },
              "viewing-file-contents-try-it-3": {
                "title": "Tâche dans le terminal : compter le nombre de lignes avec la commande `wc -l`",
                "prompt": "Comptez le nombre de lignes de la liste de contrôle en exécutant la commande « `wc -l logs/checklist.txt` ».",
                "hint": "Utilisez exactement les noms de dossiers et de fichiers indiqués dans l'invite de commande, puis exécutez les commandes `ls`, `cat` ou `find` pour vérifier votre travail.",
                "help": {
                  "concept": "Une activité « Try It » vous permet de mettre en pratique la commande présentée dans la leçon dans un environnement de travail réel.",
                  "hint_1": "Créez les dossiers parents avant de créer ou de déplacer des fichiers.",
                  "hint_2": "Vérifiez votre travail à l'aide des commandes ls, cat ou find avant de cliquer sur « Vérifier »."
                },
                "starterCode": "# Use the terminal for this Linux task.",
                "terminalExpectations": {
                  "requiredCommands": {
                    "0": {
                      "message": "Exécutez la commande « `wc -l logs/checklist.txt` »."
                    }
                  },
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "logs_checklist_txt": {
                    "content": "open room\nset chairs\ncheck projector\nwelcome guests\n"
                  }
                }
              }
            },
            "try_viewing_file_contents_sketch0": {
              "title": "Essayez vous-même : lisez un fichier avec la commande `cat`",
              "prompt": "Exécutez la commande « `cat cafe/menu.txt` » pour afficher l'intégralité du fichier de menu."
            },
            "try_viewing_file_contents_sketch1": {
              "title": "Essayez vous-même : aperçu avec « head » et « tail »",
              "prompt": "Exécutez la commande « `head logs/event.log` », puis « `tail logs/event.log` », pour prévisualiser le début et la fin du fichier."
            },
            "try_viewing_file_contents_sketch2": {
              "title": "Essayez vous-même : comptez le nombre de lignes avec la commande `wc -l`",
              "prompt": "Exécutez la commande « `wc -l logs/checklist.txt` » pour compter le nombre de lignes de la liste de contrôle."
            }
          },
          "practice": {
            "sc-tail-purpose": {
              "title": "Choisissez la commande la plus appropriée pour les dernières lignes",
              "prompt": "Un club ajoute sans cesse de nouvelles entrées au fichier `updates.txt`. Quelle commande est la plus adaptée pour visualiser rapidement la fin de ce fichier ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez chaque option au sujet précis mentionné dans la question.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "cat",
                "b": "tête",
                "c": "queue",
                "d": "wc"
              }
            },
            "mc-cat-uses": {
              "title": "Quand le chat est le bon choix",
              "prompt": "Un assistant étudiant consulte des fichiers dans un dossier contenant des notes de cours. Quelles sont les tâches pour lesquelles l'`cat` est particulièrement utile ? Cochez toutes les réponses qui s'appliquent.",
              "hint": "Réfléchissez aux situations dans lesquelles il est utile de voir l'intégralité du texte d'un seul coup d'œil.",
              "help": {
                "concept": "`cat` affiche l'intégralité du contenu d'un fichier sur le terminal ; cette commande est donc particulièrement adaptée aux fichiers texte courts, lorsque vous souhaitez en lire l'intégralité.",
                "hint_1": "Recherchez des exercices dans lesquels l'apprenant souhaite obtenir le fichier dans son intégralité, et pas seulement le début, la fin ou un nombre donné de lignes.",
                "hint_2": "Deux options consistent à lire l'intégralité du texte directement. Les autres correspondent davantage à `wc`, `head` ou `tail`."
              },
              "options": {
                "a": "Lire chaque ligne d'un fichier contenant une courte liste de contrôle",
                "b": "Afficher uniquement les dernières lignes d'un long fichier journal",
                "c": "Afficher l'intégralité du contenu d'un petit mémo",
                "d": "Compter le nombre de mots dans un brouillon de dissertation"
              }
            },
            "mc-wc-meaning": {
              "title": "Ce que « wc » vous indique",
              "prompt": "Vous exécutez la commande « `wc draft.txt` » tout en consultant une annonce destinée aux étudiants. Quels types d'informations la commande « `wc` » peut-elle fournir sur ce fichier ? Sélectionnez toutes les réponses qui s'appliquent.",
              "hint": "Concentrez-vous sur le nombre de mots, et non sur le contenu du texte lui-même.",
              "help": {
                "concept": "`wc` résume le volume de texte contenu dans un fichier en indiquant des statistiques telles que le nombre de lignes, de mots et de caractères.",
                "hint_1": "Recherchez les commandes permettant de mesurer la taille du contenu d'un fichier plutôt que celles qui affichent du texte.",
                "hint_2": "`wc` propose trois types de synthèses basées sur le nombre."
              },
              "options": {
                "a": "Combien y a-t-il de lignes dans le fichier ?",
                "b": "Combien y a-t-il de mots dans le fichier ?",
                "c": "Combien y a-t-il de caractères dans le fichier ?",
                "d": "La toute dernière phrase du fichier"
              }
            },
            "dr-inspect-order": {
              "title": "Examiner un fichier en suivant un ordre logique",
              "prompt": "Organisez ces actions dans un ordre logique pour vérifier un fichier texte dans le terminal après avoir accédé au dossier d'un projet.",
              "hint": "Lisez chaque élément et classez-les dans l'ordre dans lequel l'énoncé doit être compris.",
              "help": {
                "concept": "Les éléments doivent former un ensemble cohérent, présenté dans un ordre logique.",
                "hint_1": "Commencez par le passage qui présente l'idée ou l'action.",
                "hint_2": "Placez les pièces liées à un emplacement précis après l'élément qu'elles décrivent ou complètent."
              },
              "tokens": {
                "t1": "ls",
                "t2": "cat notes.txt",
                "t3": "wc notes.txt"
              }
            },
            "fb-head-purpose": {
              "title": "Choisissez la bonne commande d'aperçu",
              "prompt": "Un enseignant a enregistré un fichier volumineux intitulé « `chapter_notes.txt` », et vous souhaitez uniquement en consulter le début.",
              "hint": "Choisissez la commande qui permet d'afficher le début d'un fichier.",
              "help": {
                "concept": "`the missing term` affiche la première partie d'un fichier, ce qui est utile lorsque vous souhaitez avoir un aperçu rapide du début du fichier.",
                "hint_1": "Cette commande est le pendant de « `tail` ».",
                "hint_2": "Utilisez la commande qui correspond à la notion de « haut » ou de « début » du fichier."
              },
              "template": "[blank1] chapitre_notes.txt",
              "choices": [
                "cat",
                "tête",
                "queue",
                "wc"
              ]
            },
            "code-cat-menu": {
              "title": "Consulter le fichier du menu d'un café",
              "prompt": "Vous souhaitez vérifier chaque ligne d'un petit fichier de menu. Quel résultat indique que la commande « `cat` » a fonctionné correctement ?",
              "hint": "Utilisez la commande qui affiche l'intégralité d'un fichier dans le terminal.",
              "help": {
                "concept": "Pour les fichiers texte courts, la commande « `cat` » affiche l'intégralité du fichier directement dans le terminal, ce qui vous permet de consulter toutes les lignes d'un seul coup d'œil.",
                "hint_1": "Vous n'avez pas besoin de changer de dossier ni de modifier le fichier. Exécutez une seule commande sur `menu.txt`.",
                "hint_2": "Utilisez le nom de la commande mentionnée dans cette rubrique qui permet d'afficher l'intégralité du contenu d'un fichier."
              },
              "template": "Une commande qui lit un fichier dans son intégralité devrait ____ afin que vous puissiez en voir clairement le contenu.",
              "choices": [
                "afficher un résultat observable",
                "masquer toutes les sorties",
                "supprimer le fichier immédiatement",
                "passer le programme"
              ]
            }
          }
        }
      },
      "linux-module-3-final-capstone": {
        "final-capstone-file-room-handoff": {
          "label": "Projet de fin d'études : Transfert des dossiers",
          "summary": "Utilisez le terminal Linux pour transformer un espace de travail désorganisé en un transfert bien ordonné : examinez ce qui s'y trouve, classez les fichiers dans les dossiers appropriés, sauvegardez les notes importantes, supprimez les fichiers temporaires superflus et indiquez clairement que le travail est terminé.",
          "cards": {
            "sketch0": {
              "title": "Résumé de la passation de la salle des archives communautaires"
            },
            "project": {
              "title": "Transfert de la salle des archives communautaires"
            }
          },
          "finalCapstone": {
            "steps": {
              "final-capstone-file-room-handoff-terminal-task-1": {
                "title": "Faire l'inventaire de la boîte de réception de l'archive",
                "prompt": "Vous entamez le transfert final de l'événement et avez besoin d'un relevé rapide des éléments reçus. Vérifiez votre boîte de réception, puis créez un document «`community-file-room/handoff/inventory.txt`» pour indiquer que l'examen des éléments reçus a bien eu lieu.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "community_file_room_inbox_agenda_txt": {
                    "content": "Community event agenda\n"
                  },
                  "community_file_room_inbox_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "community_file_room_inbox_tmp_scratch_txt": {
                    "content": "Temporary scratch note\n"
                  },
                  "community_file_room_inbox_venue_txt": {
                    "content": "Venue setup notes\n"
                  }
                }
              },
              "final-capstone-file-room-handoff-terminal-task-2": {
                "title": "Trier l'ordre du jour, la liste des invités et les notes sur le lieu de la réunion",
                "prompt": "La boîte de réception contient encore des fichiers d'événements épars. Créez les dossiers suivants : `community-file-room/agenda`, `community-file-room/guests` et `community-file-room/venue`, puis déplacez les fichiers `agenda.txt`, `guest-list.txt` et `venue.txt` du dossier `community-file-room/inbox` vers leurs dossiers respectifs.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "community_file_room_inbox_agenda_txt": {
                    "content": "Community event agenda\n"
                  },
                  "community_file_room_inbox_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "community_file_room_inbox_tmp_scratch_txt": {
                    "content": "Temporary scratch note\n"
                  },
                  "community_file_room_inbox_venue_txt": {
                    "content": "Venue setup notes\n"
                  },
                  "community_file_room_handoff_inventory_txt": {
                    "content": "agenda.txt\nguest-list.txt\ntmp-scratch.txt\nvenue.txt\n"
                  }
                }
              },
              "final-capstone-file-room-handoff-terminal-task-3": {
                "title": "Retour à l'ordre du jour",
                "prompt": "Avant que quelqu'un ne range l'espace de travail, enregistrez une copie de l'ordre du jour. Copiez `community-file-room/agenda/agenda.txt` vers `community-file-room/backups/agenda.txt`.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "community_file_room_inbox_tmp_scratch_txt": {
                    "content": "Temporary scratch note\n"
                  },
                  "community_file_room_handoff_inventory_txt": {
                    "content": "agenda.txt\nguest-list.txt\ntmp-scratch.txt\nvenue.txt\n"
                  },
                  "community_file_room_agenda_agenda_txt": {
                    "content": "Community event agenda\n"
                  },
                  "community_file_room_guests_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "community_file_room_venue_venue_txt": {
                    "content": "Venue setup notes\n"
                  }
                }
              },
              "final-capstone-file-room-handoff-terminal-task-4": {
                "title": "Créer un résumé de l'évaluation",
                "prompt": "Une fois que vous aurez vérifié l'ordre du jour et la liste des invités, le prochain bénévole aura besoin d'une brève note récapitulative. Créez le fichier « `community-file-room/handoff/review-summary.txt` » pour y consigner ce résumé.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "community_file_room_inbox_tmp_scratch_txt": {
                    "content": "Temporary scratch note\n"
                  },
                  "community_file_room_handoff_inventory_txt": {
                    "content": "agenda.txt\nguest-list.txt\ntmp-scratch.txt\nvenue.txt\n"
                  },
                  "community_file_room_agenda_agenda_txt": {
                    "content": "Community event agenda\n"
                  },
                  "community_file_room_guests_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "community_file_room_venue_venue_txt": {
                    "content": "Venue setup notes\n"
                  },
                  "community_file_room_backups_agenda_txt": {
                    "content": "Community event agenda\n"
                  }
                }
              },
              "final-capstone-file-room-handoff-terminal-task-5": {
                "title": "Débarrasser les objets temporairement en désordre et indiquer que c'est prêt",
                "prompt": "Terminez le transfert de l'événement en supprimant le fichier temporaire de la boîte de réception et en créant un fichier «`community-file-room/handoff/READY.txt` » afin que l'espace de travail indique clairement qu'il est prêt.",
                "hint": "Il s'agit d'une étape cumulative du projet. Partez de l'espace de travail précédent et ajoutez uniquement la modification demandée.",
                "help": {
                  "concept": "Les étapes du projet sont liées entre elles. Conservez les livrables antérieurs et ajoutez-y un nouvel élément utile.",
                  "hint_1": "Utilisez les commandes « ls » ou « find » pour vérifier l'espace de travail actuel avant de le modifier.",
                  "hint_2": "Ne supprimez pas les fichiers créés lors des étapes précédentes, sauf si un message vous demande explicitement de supprimer un fichier temporaire."
                },
                "starterCode": "# Use the terminal for this Linux project step.\n",
                "terminalExpectations": {
                  "forbiddenCommands": {
                    "0": {
                      "message": "N'utilisez pas « sudo » pour les tâches courantes dans l'espace de travail."
                    }
                  }
                },
                "starterFiles": {
                  "community_file_room_inbox_tmp_scratch_txt": {
                    "content": "Temporary scratch note\n"
                  },
                  "community_file_room_handoff_inventory_txt": {
                    "content": "agenda.txt\nguest-list.txt\ntmp-scratch.txt\nvenue.txt\n"
                  },
                  "community_file_room_handoff_review_summary_txt": {
                    "content": "Agenda and guest list reviewed for handoff\n"
                  },
                  "community_file_room_agenda_agenda_txt": {
                    "content": "Community event agenda\n"
                  },
                  "community_file_room_guests_guest_list_txt": {
                    "content": "Guest list\n"
                  },
                  "community_file_room_venue_venue_txt": {
                    "content": "Venue setup notes\n"
                  },
                  "community_file_room_backups_agenda_txt": {
                    "content": "Community event agenda\n"
                  }
                }
              }
            }
          }
        }
      }
    },
    "linux--linux-terminal-fundamentals--draft": {
      "linux-module-1-terminal-navigation": {
        "what-the-terminal-is": {
          "label": "Qu'est-ce que le Terminal ?",
          "summary": "Considérez le terminal comme un endroit où l'on tape des commandes et où l'on voit l'ordinateur y répondre.",
          "cards": {
            "sketch0": {
              "title": "Le terminal, c'est comme une conversation avec votre ordinateur"
            },
            "sketch1": {
              "title": "Les commandes sont des instructions, et la sortie correspond à la réponse"
            },
            "sketch2": {
              "title": "Pourquoi les gens utilisent-ils le terminal ?"
            },
            "quiz": {
              "title": "Entraînement"
            }
          },
          "practice": {
            "sc-terminal-purpose": {
              "title": "Fonctionnalités du terminal",
              "prompt": "Vous participez à l'organisation de l'espace de travail d'un club à l'aide de dossiers et de fichiers. Quelle description correspond le mieux au répertoire ?",
              "hint": "Demandez-vous si le terminal est un endroit où l'on tape des commandes ou un espace de stockage de fichiers à part entière.",
              "help": {
                "concept": "Le terminal est une interface permettant de saisir des commandes et de visualiser les réponses de l'ordinateur. Il ne s'agit pas d'un dossier, d'un fichier ou d'un système d'exploitation.",
                "hint_1": "Choisissez l'option qui décrit le mieux cette interaction : vous tapez quelque chose et l'ordinateur répond.",
                "hint_2": "Recherchez l'option qui décrit un outil en mode texte permettant d'exécuter des commandes."
              },
              "options": {
                "a": "Un environnement en mode texte permettant de saisir des commandes et de voir la réaction de l'ordinateur",
                "b": "Un dossier qui enregistre automatiquement tous les fichiers que vous créez",
                "c": "Un fichier spécial qui répertorie toutes les commandes de l'ordinateur",
                "d": "Un processus d'arrière-plan qui s'exécute sans intervention de l'utilisateur"
              }
            },
            "sc-pwd-vs-ls": {
              "title": "Choisissez l'objectif de commande approprié",
              "prompt": "Un apprenant tape une commande car il souhaite savoir dans quel dossier il se trouve actuellement avant d'afficher la liste des fichiers. Quelle commande correspond à cet objectif ?",
              "hint": "Servez-vous de l'explication donnée dans la leçon et de la formulation de cette question pour affiner votre réponse.",
              "help": {
                "concept": "Ce texte d'aide a été modifié, car la formulation initiale révélait la réponse de manière trop directe.",
                "hint_1": "Comparez la question à l'exemple donné dans la leçon et supprimez les détails qui ne correspondent pas au concept demandé.",
                "hint_2": "Utilisez le rôle ou l'élément de preuve mentionné dans l'énoncé plutôt que de vous fier à la formulation de la réponse."
              },
              "options": {
                "a": "pwd",
                "b": "ls",
                "c": "cat",
                "d": "touch"
              }
            },
            "mc-terminal-workflow": {
              "title": "Quels sont les éléments indispensables d'un flux de travail de base dans un terminal ?",
              "prompt": "Sélectionnez toutes les actions qui correspondent à l'idée d'utiliser le terminal pour inspecter un espace de travail en toute sécurité au début d'une tâche.",
              "hint": "Réfléchissez aux commandes qui vous permettent de vérifier votre emplacement et de voir ce que contient le dossier actuel.",
              "help": {
                "concept": "Les premières étapes d'un workflow en terminal commencent souvent par des commandes d'inspection telles que « `pwd` » et « `ls` », afin que vous puissiez vous faire une idée de votre emplacement actuel et du contenu avant d'effectuer des modifications.",
                "hint_1": "Recherchez les actions qui vous aident à vous repérer avant de créer, déplacer ou supprimer quoi que ce soit.",
                "hint_2": "Deux de ces options permettent d'accéder directement à ces informations : l'une affiche le dossier dans lequel vous vous trouvez actuellement, et l'autre répertorie les éléments qu'il contient."
              },
              "options": {
                "a": "Exécutez la commande « `pwd` » pour vérifier le dossier actuel.",
                "b": "Exécutez la commande « `ls` » pour afficher les fichiers et dossiers de l'emplacement actuel.",
                "c": "Utilisez « `sudo` » pour prendre le contrôle total avant de cocher quoi que ce soit",
                "d": "Installez un paquet pour que le terminal puisse afficher les noms des dossiers"
              }
            },
            "dr-terminal-check-sequence": {
              "title": "Demander un simple contrôle du terminal",
              "prompt": "Classez ces étapes dans l'ordre le plus approprié pour un débutant qui ouvre le terminal et souhaite se familiariser avec l'environnement de travail avant toute autre chose.",
              "hint": "Lisez chaque élément et classez-les dans l'ordre dans lequel l'énoncé doit être compris.",
              "help": {
                "concept": "Les éléments doivent former un ensemble cohérent, présenté dans un ordre logique.",
                "hint_1": "Commencez par le passage qui présente l'idée ou l'action.",
                "hint_2": "Placez les pièces liées à un emplacement précis après l'élément qu'elles décrivent ou complètent."
              },
              "tokens": {
                "t1": "Ouvrez le terminal",
                "t2": "Exécutez la commande « `pwd` »",
                "t3": "Exécutez la commande « `ls` »"
              }
            },
            "fb-pwd-meaning": {
              "title": "Complétez la signification de la commande",
              "prompt": "Complétez la commande manquante dans cette situation : vous souhaitez que le terminal affiche l'emplacement de votre dossier actuel.",
              "hint": "Choisissez la commande qui affiche le répertoire de travail.",
              "help": {
                "concept": "`the missing term` est la commande qui permet d'afficher le répertoire de travail actuel dans le terminal.",
                "hint_1": "Cette commande est l'abréviation de « afficher le répertoire de travail ».",
                "hint_2": "C'est la commande à utiliser lorsque vous voulez que le terminal réponde à la question « Où suis-je ? »"
              },
              "template": "Pour afficher l'emplacement du dossier dans lequel vous vous trouvez actuellement, tapez « `[blank1]` ».",
              "choices": [
                "pwd",
                "ls",
                "cat",
                "mkdir"
              ]
            },
            "fb-ls-purpose": {
              "title": "Précisez l'objectif de la commande",
              "prompt": "Complétez la commande manquante dans cette situation : vous vous trouvez dans un dossier de projet et vous souhaitez afficher les noms des fichiers et des dossiers qu'il contient.",
              "hint": "Choisissez la commande qui affiche la liste des éléments du répertoire actuel.",
              "help": {
                "concept": "`the missing term` affiche le contenu du répertoire actuel, notamment les fichiers et les dossiers.",
                "hint_1": "Cette commande vous aide à répondre à la question « Qu'y a-t-il ici ? »",
                "hint_2": "Ce n'est pas la commande qui permet d'afficher votre position ; c'est celle qui permet d'afficher la liste des noms."
              },
              "template": "Pour afficher la liste des noms des fichiers et des dossiers du répertoire actuel, tapez « `[blank1]` ».",
              "choices": [
                "pwd",
                "touch",
                "ls",
                "mv"
              ]
            }
          },
          "tryIt": {
            "exercises": {
              "what-the-terminal-is-try-it-1": {
                "prompt": "Vous venez de créer un espace de travail partagé. Lancez la commande « `pwd` » pour voir où vous en êtes.",
                "title": "Tâche du terminal : exécuter pwd"
              },
              "what-the-terminal-is-try-it-2": {
                "title": "Tâche du terminal : exécuter la commande « ls »",
                "prompt": "Jetez un coup d'œil rapide autour de vous. Exécutez la commande « `ls` » pour voir ce que contient le dossier actuel."
              },
              "what-the-terminal-is-try-it-3": {
                "title": "Tâche finale : demander où et quoi",
                "prompt": "Avant de modifier quoi que ce soit, commencez par vous familiariser avec le système. Exécutez la commande « `pwd` », puis « `ls` »."
              }
            },
            "try_what_the_terminal_is_sketch0": {
              "title": "Essayez vous-même : lancez la commande « pwd »",
              "prompt": "Exécutez la commande « `pwd` » pour afficher le dossier dans lequel vous vous trouvez actuellement."
            },
            "try_what_the_terminal_is_sketch1": {
              "title": "Essayez vous-même : lancez la commande « ls »",
              "prompt": "Exécutez la commande « `ls` » pour afficher la liste des fichiers et dossiers contenus dans le dossier actuel."
            },
            "try_what_the_terminal_is_sketch2": {
              "title": "Essayez vous-même : lancez la commande « pwd », puis « ls »",
              "prompt": "Exécutez la commande « `pwd` », puis « `ls` », pour connaître votre position avant de commencer à travailler."
            }
          }
        }
      }
    },
    "python": {
      "python-0": {
        "comments_intro": {
          "label": "Commentaires : des notes pour les humains (Python les ignore)",
          "summary": "Utilise les commentaires pour expliquer l’intention, nommer les étapes, et désactiver temporairement du code pendant le debug (y compris des notes sur plusieurs lignes).",
          "cards": {
            "sketch": {
              "title": "Commentaires en Python (#)"
            },
            "quiz": {
              "title": "Vérification rapide : commentaires"
            }
          }
        }
      },
      "python-1": {
        "data_types_intro": {
          "label": "Data Types + Conversion: What’s in the Box?",
          "summary": "Learn core Python types (int/float/str/bool/None), how input() returns strings, and how to convert types safely.",
          "cards": {
            "sketch0": {
              "title": "Data Types: What’s Inside the Box?"
            },
            "sketch1": {
              "title": "Type Conversion: Turning Strings into Numbers"
            },
            "quiz": {
              "title": "Project: Convert → Compute → Format"
            }
          },
          "projectSteps": {
            "convert_next_year": {
              "title": "Convert age to int and compute next year"
            },
            "tip_total": {
              "title": "Compute tip + total using integer math"
            },
            "c_to_f": {
              "title": "Convert Celsius to Fahrenheit"
            }
          }
        },
        "errors_intro": {
          "label": "Common Errors + Debugging: Read the Message, Fix the Code",
          "summary": "Learn to recognize NameError, TypeError, and ValueError, then practice quick debugging patterns and safe conversions.",
          "cards": {
            "sketch": {
              "title": "Common Errors: NameError, TypeError, and Debug Tricks"
            },
            "project": {
              "title": "Project: Identify → Fix → Validate"
            }
          },
          "projectSteps": {
            "identify_error": {
              "title": "Identify the error type (NameError vs TypeError vs ValueError)"
            },
            "fix_type_mismatch": {
              "title": "Fix a type mismatch (convert and add numbers)"
            },
            "avoid_valueerror": {
              "title": "Avoid ValueError with basic validation"
            }
          }
        },
        "input_output_patterns": {
          "label": "Schémas d’entrée + sortie : de vrais mini-programmes",
          "summary": "Combine `input()`, la conversion de type, les opérateurs et les f-strings dans de vrais mini-programmes comme l’âge l’année prochaine, un calculateur de pourboire et un convertisseur de température.",
          "cards": {
            "sketch": {
              "title": "Schémas d’entrée + sortie (Demander → Convertir → Calculer → Afficher)"
            },
            "quiz": {
              "title": "Projet : 3 mini-programmes (Demander → Convertir → Calculer → Afficher)"
            }
          },
          "projectSteps": {
            "age_next_year": {
              "title": "Âge l’année prochaine"
            },
            "tip_calc": {
              "title": "Calculateur de pourboire"
            },
            "temp_convert": {
              "title": "Convertisseur de température (C → F)"
            }
          }
        },
        "operators_expressions": {
          "label": "Operators + Expressions: The Calculator Inside Your Code",
          "summary": "Use math and comparison operators to compute results and produce True/False decisions using expressions.",
          "cards": {
            "sketch": {
              "title": "Operators + Expressions (Math + Comparisons)"
            },
            "quiz": {
              "title": "Project: Calculator brain (compute + decide)"
            }
          },
          "projectSteps": {
            "precedence": {
              "title": "Operator precedence (compute the result)"
            },
            "mod_even_odd": {
              "title": "Modulo (even/odd detector)"
            },
            "checkout": {
              "title": "Build a mini checkout line (subtotal, tax, total)"
            }
          }
        },
        "string_basics": {
          "label": "String Basics: Working With Text Like a Pro",
          "summary": "Learn strings: concatenation vs commas, f-strings, indexing/slicing, and common methods like lower(), strip(), replace().",
          "cards": {
            "sketch": {
              "title": "Strings (Concatenation, f-strings, Indexing, Methods)"
            },
            "project": {
              "title": "Project: Clean + human output"
            }
          },
          "projectSteps": {
            "concat_vs_comma": {
              "title": "Concatenation vs commas (what prints?)"
            },
            "fstring_greeting": {
              "title": "Use an f-string to print a clean sentence"
            },
            "username_generator": {
              "title": "Build a username generator (strip + lower + indexing)"
            }
          }
        },
        "variables_intro": {
          "label": "Variables: Labeled Boxes That Hold Values",
          "summary": "Understand variables as labeled boxes, assign values with '=', and practice updating values with real-world mini tasks.",
          "cards": {
            "sketch": {
              "title": "Variables: Labeled Boxes for Your Data"
            },
            "project": {
              "title": "Project: Store → Swap → Total"
            }
          },
          "projectSteps": {
            "boxes_print": {
              "title": "Store inputs in variables and print cleanly"
            },
            "swap_values": {
              "title": "Swap two values (real-world correction)"
            },
            "running_total": {
              "title": "Compute a running total (3-day steps)"
            }
          }
        }
      }
    },
    "sql": {
      "sql_module_5": {
        "adding-and-subtracting": {
          "label": "Addition et soustraction",
          "summary": "Apprenez à utiliser l'addition et la soustraction dans les colonnes calculées SQL pour créer de nouvelles valeurs dans vos requêtes.",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une colonne calculée ?"
            },
            "sketch1": {
              "title": "Addition et soustraction dans SELECT"
            },
            "sketch2": {
              "title": "Utiliser des alias pour plus de clarté"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "quiz-1": {
              "title": "Calculez le total de ligne pour chaque commande",
              "prompt": "Écrivez une requête SQL pour afficher l'id de chaque commande, le nom du client, la quantité, le prix unitaire et une colonne calculée appelée line_total (quantity * unit_price) depuis la table orders.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ci-dessous"
            },
            "quiz-2": {
              "title": "Soustraire une remise fixe de chaque commande",
              "prompt": "Écrivez une requête SQL pour afficher id, customer_name et une nouvelle colonne appelée discounted_total qui soustrait 10 du total de ligne (quantity * unit_price) pour chaque commande.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ci-dessous"
            },
            "quiz-3": {
              "title": "Quel opérateur est utilisé pour la soustraction dans les expressions SQL ?",
              "prompt": "Quel symbole utilisez-vous pour soustraire une colonne ou une valeur d'une autre dans une instruction SQL SELECT ?",
              "hint": "C'est le même symbole que celui utilisé pour la soustraction en arithmétique de base.",
              "help": {
                "concept": "SQL utilise les opérateurs arithmétiques standards : + pour l'addition, - pour la soustraction, * pour la multiplication et / pour la division.",
                "hint_1": "Pensez au symbole que vous utilisez pour soustraire des nombres en mathématiques.",
                "hint_2": "Ce n'est pas le symbole plus, multiplier ou diviser."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "quiz-4": {
              "title": "Lesquelles des colonnes calculées suivantes sont valides en SQL ?",
              "prompt": "Sélectionnez toutes les expressions ci-dessous qui pourraient être utilisées comme colonnes calculées dans une instruction SELECT.",
              "hint": "Considérez quels opérateurs sont valides pour l'arithmétique en SQL.",
              "help": {
                "concept": "SQL prend en charge +, -, * et / pour les calculs arithmétiques dans les instructions SELECT. L'opérateur & n'est pas utilisé pour l'arithmétique en SQL.",
                "hint_1": "Cherchez les expressions qui utilisent des opérateurs mathématiques standards.",
                "hint_2": "Le symbole & n'est pas un opérateur arithmétique en SQL."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "quiz-5": {
              "title": "Complétez : Ajouter des frais fixes",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l'énoncé.",
              "hint": "Le blanc doit être rempli avec le montant des frais fixes.",
              "help": {
                "concept": "Pour ajouter une valeur fixe à une colonne calculée, il suffit d'utiliser le nombre dans l'expression.",
                "hint_1": "Vous voulez ajouter le nombre, le terme manquant, au total calculé.",
                "hint_2": "N'utilisez pas un nom de colonne ; utilisez le montant réel des frais."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "3",
                "quantity",
                "unit_price",
                "shipping",
                "fee"
              ]
            }
          }
        },
        "as": {
          "label": "AS",
          "summary": "AS dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce que AS en SQL ?"
            },
            "sketch1": {
              "title": "Pourquoi utiliser des alias de colonnes ?"
            },
            "sketch2": {
              "title": "Alias avec fonctions et expressions"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer et donner un alias à une colonne",
              "prompt": "Écrivez une requête SQL pour sélectionner `customer_name` et une colonne calculée pour la valeur totale de chaque commande (quantité multipliée par unit_price), nommée `order_total`, depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q2": {
              "title": "Utiliser AS avec des fonctions",
              "prompt": "Écrivez une requête SQL pour sélectionner `customer_name` et la version en majuscules de `region` (en utilisant la fonction UPPER), nommée `region_upper`, depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q3": {
              "title": "But de AS",
              "prompt": "Quel est le but principal du mot-clé AS dans une instruction SELECT en SQL ?",
              "hint": "Réfléchissez à la façon dont AS modifie la sortie.",
              "help": {
                "concept": "AS est utilisé pour attribuer un alias à une colonne ou une expression, rendant la sortie plus lisible.",
                "hint_1": "AS n'affecte pas le filtrage, la jointure ou le tri.",
                "hint_2": "Il s'agit principalement de nommer les colonnes dans votre sortie."
              },
              "options": {
                "a": "a. Filtrer les lignes selon une condition",
                "b": "b. Renommer une colonne ou une expression dans le résultat",
                "c": "c. Joindre deux tables",
                "d": "d. Trier les résultats"
              }
            },
            "q4": {
              "title": "Où peut-on utiliser AS ?",
              "prompt": "Dans lesquels des scénarios suivants pouvez-vous utiliser le mot-clé AS dans une instruction SELECT SQL ? (Choisissez toutes les réponses qui conviennent)",
              "hint": "AS est flexible avec les colonnes et les expressions.",
              "help": {
                "concept": "AS est utilisé pour les alias de colonnes et d'expressions dans SELECT, pas pour le filtrage ou les alias de tables dans FROM.",
                "hint_1": "Réfléchissez à l'endroit où vous souhaitez changer le nom de la colonne dans la sortie.",
                "hint_2": "AS n'est pas utilisé pour le filtrage ou le renommage de table dans la clause FROM."
              },
              "options": {
                "a": "a. Renommer une colonne calculée",
                "b": "b. Renommer une colonne issue d'une fonction",
                "c": "c. Renommer une table dans la clause FROM",
                "d": "d. Filtrer les lignes selon une condition"
              }
            },
            "q5": {
              "title": "Compléter : syntaxe des alias",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l'énoncé.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "Le blanc doit être rempli avec le terme SQL qui correspond à la fonction que l'énoncé essaie d'accomplir.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans l'énoncé.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de l'énoncé."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "AS",
                "WITH",
                "BY",
                "INTO"
              ]
            }
          }
        },
        "date-function-awareness": {
          "label": "Sensibilisation aux fonctions de date",
          "summary": "Apprenez à reconnaître et à utiliser les fonctions de date dans les expressions SQL, en particulier pour les colonnes calculées et les rapports.",
          "cards": {
            "sketch0": {
              "title": "Quelles sont les fonctions de date en SQL ?"
            },
            "sketch1": {
              "title": "Utiliser les fonctions de date dans les colonnes calculées"
            },
            "sketch2": {
              "title": "Filtrer avec des fonctions de date"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Extraire l'année de order_date",
              "prompt": "Écrivez une requête SQL pour sélectionner les colonnes `id`, `order_date` et une colonne calculée appelée `order_year` qui contient la partie année de `order_date` depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, order_date\n-- Ajoutez la colonne calculée ici\nFROM orders;"
            },
            "q2": {
              "title": "Filtrer les commandes par mois à l'aide d'une fonction de date",
              "prompt": "Écrivez une requête SQL pour sélectionner toutes les colonnes de `orders` où la commande a été passée en janvier (mois = '01').",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT *\nFROM orders\n-- Ajoutez votre clause WHERE ici ;"
            },
            "q3": {
              "title": "But des fonctions de date",
              "prompt": "Laquelle des propositions suivantes décrit le mieux le but des fonctions de date en SQL ?",
              "hint": "Pensez à ce que vous pouvez faire avec les dates en SQL.",
              "help": {
                "concept": "Les fonctions de date vous aident à manipuler et à extraire des informations à partir des colonnes de date.",
                "hint_1": "Elles servent à obtenir des parties d'une date ou à effectuer des calculs avec des dates.",
                "hint_2": "Elles ne servent pas à formater des nombres ou à joindre des tables."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4": {
              "title": "Reconnaître l'utilisation des fonctions de date",
              "prompt": "Lesquelles des expressions SQL suivantes utilisent une fonction de date ? Sélectionnez toutes les réponses qui conviennent.",
              "hint": "Cherchez des fonctions qui opèrent sur des valeurs de date.",
              "help": {
                "concept": "Les fonctions de date incluent des fonctions comme `strftime`, `date` et `datetime` qui travaillent avec des colonnes de date.",
                "hint_1": "Vérifiez si la fonction sert à extraire ou manipuler des informations de date.",
                "hint_2": "Toutes les fonctions présentées ne sont pas liées aux dates."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5": {
              "title": "Extraire le mois d'une date",
              "prompt": "Quelle fonction utiliseriez-vous pour extraire le mois de la colonne `order_date` dans SQLite ?",
              "hint": "Réfléchissez à la fonction qui permet d'extraire la partie mois d'une date.",
              "help": {
                "concept": "Pour extraire le mois d'une date dans SQLite, vous utilisez une fonction qui peut formater ou extraire des parties de date.",
                "hint_1": "Cherchez une fonction qui prend une date et une chaîne de format.",
                "hint_2": "La fonction commence par 'str' et est couramment utilisée pour formater les dates."
              },
              "template": "SELECT id, order_date, _____ AS order_month FROM orders;",
              "choices": [
                "strftime('%m', order_date)",
                "sum(order_date)",
                "date(order_date)",
                "substr(order_date, 6, 2)"
              ]
            }
          }
        },
        "discount-calculations": {
          "label": "Calculs de remise",
          "summary": "Apprenez à calculer des remises et à créer de nouvelles colonnes à l'aide d'expressions SQL et d'alias dans le jeu de données sales_kpi.",
          "cards": {
            "sketch0": {
              "title": "Que sont les calculs de remise en SQL ?"
            },
            "sketch1": {
              "title": "Utiliser plusieurs colonnes dans des expressions"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer un prix remisé de 20 %",
              "prompt": "Écrivez une requête SQL pour afficher l'id de chaque commande, le customer_name, le unit_price, et une nouvelle colonne nommée discounted_price qui affiche le unit_price après une remise de 20 %. Utilisez la table orders.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, customer_name, unit_price, \n       -- votre expression ici\nFROM orders;"
            },
            "q2": {
              "title": "Calculer le total de la ligne remisé",
              "prompt": "Écrivez une requête SQL pour afficher id, quantity, unit_price, et une nouvelle colonne nommée discounted_total qui affiche le prix total de chaque commande après une remise de 10 %. Utilisez la table orders.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price, \n       -- votre expression ici\nFROM orders;"
            },
            "q3": {
              "title": "But des alias de colonnes",
              "prompt": "Pourquoi devriez-vous utiliser des alias de colonnes lors du calcul de remises en SQL ?",
              "hint": "Pensez à l'apparence du résultat pour quelqu'un qui lit les résultats.",
              "help": {
                "concept": "Les alias rendent les colonnes de résultat plus compréhensibles en leur donnant des noms clairs et descriptifs.",
                "hint_1": "Les alias aident à rendre le résultat plus lisible.",
                "hint_2": "Sans alias, les colonnes calculées peuvent avoir des noms confus ou peu clairs."
              },
              "options": {
                "a": "a. Pour rendre les colonnes de sortie plus compréhensibles",
                "b": "b. Pour accélérer l'exécution de la requête",
                "c": "c. Pour éviter d'utiliser l'arithmétique en SQL",
                "d": "d. Pour masquer des colonnes dans le résultat"
              }
            },
            "q4": {
              "title": "Quelles expressions calculent une remise de 25 % ?",
              "prompt": "Sélectionnez toutes les expressions qui calculent correctement une remise de 25 % sur unit_price.",
              "hint": "Une remise de 25 % signifie conserver 75 % du prix.",
              "help": {
                "concept": "Pour appliquer une remise de 25 %, multipliez le prix par 0,75 ou soustrayez 25 % du prix à l'original.",
                "hint_1": "Multiplier par 0,75 ou soustraire unit_price * 0,25 fonctionnent tous les deux.",
                "hint_2": "Vérifiez quelles options conservent 75 % du prix ou soustraient 25 % de l'original."
              },
              "options": {
                "a": "a. unit_price * 0.75",
                "b": "b. unit_price - (unit_price * 0.25)",
                "c": "c. unit_price * 1.25",
                "d": "d. unit_price + (unit_price * 0.25)"
              }
            },
            "q5": {
              "title": "Complétez : facteur de remise",
              "prompt": "Si vous souhaitez appliquer une remise de 15 % à unit_price, par quel nombre devez-vous multiplier unit_price ?",
              "hint": "Soustrayez le taux de remise de 1.",
              "help": {
                "concept": "Le facteur de remise est 1 moins le taux de remise (sous forme décimale).",
                "hint_1": "Une remise de 15 % signifie conserver 85 % du prix.",
                "hint_2": "Convertissez 85 % en décimal."
              },
              "template": "unit_price * [VIDE]",
              "choices": [
                "0.85",
                "0.15",
                "1.15",
                "0.75"
              ]
            }
          }
        },
        "intro-to-functions": {
          "label": "Introduction aux fonctions",
          "summary": "Introduction aux fonctions dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une fonction SQL ?"
            },
            "sketch1": {
              "title": "Utiliser des fonctions dans SELECT"
            },
            "sketch2": {
              "title": "Combiner des fonctions avec des expressions"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer et arrondir les totaux de ligne",
              "prompt": "Écrivez une requête SQL pour sélectionner l'identifiant de la commande et le prix total pour chaque commande, arrondi à l'entier le plus proche. Nommez la colonne arrondie `rounded_total`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, /* votre expression ici */ FROM orders;"
            },
            "q2": {
              "title": "Utiliser une fonction de chaîne de caractères",
              "prompt": "Écrivez une requête SQL pour sélectionner le nom du client et une nouvelle colonne appelée `upper_name` qui affiche le nom du client en majuscules.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT customer_name, /* votre fonction ici */ FROM orders;"
            },
            "q3": {
              "title": "But des fonctions SQL",
              "prompt": "Quel est le but principal de l'utilisation des fonctions dans une instruction SQL SELECT ?",
              "hint": "Réfléchissez à la façon dont les fonctions modifient ou résument les données.",
              "help": {
                "concept": "Les fonctions en SQL servent à transformer, calculer ou résumer les valeurs de données dans les requêtes.",
                "hint_1": "Les fonctions peuvent traiter des valeurs pour créer de nouveaux résultats.",
                "hint_2": "Elles vous aident à modifier ou calculer de nouvelles valeurs à partir des colonnes existantes."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4": {
              "title": "Identifier les fonctions SQL",
              "prompt": "Lesquels des éléments suivants sont des exemples de fonctions SQL ? (Choisissez tout ce qui s'applique)",
              "hint": "Cherchez des opérations qui prennent des valeurs en entrée et renvoient un résultat.",
              "help": {
                "concept": "Les fonctions SQL traitent des valeurs d'entrée et renvoient un résultat, comme des opérations mathématiques ou sur des chaînes de caractères.",
                "hint_1": "Des fonctions comme ROUND et UPPER opèrent sur les valeurs des colonnes.",
                "hint_2": "SELECT, ROUND et UPPER ne sont pas tous du même type de mot-clé SQL."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5": {
              "title": "Compléter : utilisation d'une fonction",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l'énoncé.",
              "hint": "L'alias est le nouveau nom de colonne.",
              "help": {
                "concept": "Le mot-clé AS permet de renommer le résultat d'une fonction ou d'une expression en SQL.",
                "hint_1": "Choisissez un nom qui décrit la version en minuscules du nom du client.",
                "hint_2": "Un alias courant est 'le terme manquant' ou quelque chose de similaire."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "lower_name",
                "customer_lower",
                "name_lower",
                "customername",
                "customer"
              ]
            }
          }
        },
        "math-in-sql": {
          "label": "Mathématiques en SQL",
          "summary": "Mathématiques en SQL dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Utiliser l'arithmétique dans SQL SELECT"
            },
            "sketch1": {
              "title": "Renommer les colonnes calculées avec des alias"
            },
            "sketch2": {
              "title": "Expressions et valeurs NULL"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Calculer le total de ligne pour chaque commande",
              "prompt": "Écrivez une requête SQL pour sélectionner `id`, `quantity`, `unit_price` et une nouvelle colonne appelée `line_total` qui multiplie `quantity` par `unit_price` pour chaque commande dans la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "code-2": {
              "title": "Appliquer une remise de 10 % à chaque commande",
              "prompt": "Écrivez une requête SQL pour sélectionner `id`, `customer_name` et une nouvelle colonne appelée `discounted_total` qui affiche le total après application d'une remise de 10 % au total de ligne (`quantity * unit_price`).",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, customer_name\nFROM orders;"
            },
            "single-1": {
              "title": "Comprendre les expressions SQL",
              "prompt": "Laquelle des propositions suivantes est une expression SQL valide pour créer une nouvelle colonne qui double la quantité dans la table `orders` ?",
              "hint": "Cherchez une expression qui multiplie quantity par 2.",
              "help": {
                "concept": "Une expression SQL peut utiliser des opérateurs arithmétiques pour créer de nouvelles valeurs dans la clause SELECT.",
                "hint_1": "Doubler signifie multiplier par 2.",
                "hint_2": "Vérifiez quelle option utilise l'opérateur de multiplication avec quantity."
              },
              "options": {
                "a": "a. SELECT quantity + 2 AS double_quantity FROM orders;",
                "b": "b. SELECT quantity * 2 AS double_quantity FROM orders;",
                "c": "c. SELECT quantity / 2 AS double_quantity FROM orders;",
                "d": "d. SELECT quantity - 2 AS double_quantity FROM orders;"
              }
            },
            "multi-1": {
              "title": "Choisir les bons alias SQL",
              "prompt": "Lesquelles des requêtes suivantes utilisent correctement des alias pour renommer des colonnes calculées ? Sélectionnez toutes les réponses correctes.",
              "hint": "Cherchez l'utilisation de AS pour attribuer un nouveau nom à une colonne calculée.",
              "help": {
                "concept": "Les alias en SQL sont créés avec le mot-clé AS pour renommer les colonnes, en particulier les colonnes calculées.",
                "hint_1": "Vérifiez la bonne utilisation de AS pour attribuer un nouveau nom de colonne.",
                "hint_2": "Seules les options qui utilisent correctement AS sont des alias valides."
              },
              "options": {
                "a": "a. SELECT quantity * unit_price AS total FROM orders;",
                "b": "b. SELECT quantity * unit_price total FROM orders;",
                "c": "c. SELECT quantity * unit_price AS total_amount FROM orders;",
                "d": "d. SELECT quantity * unit_price = total FROM orders;"
              }
            },
            "fill-1": {
              "title": "Effet de NULL dans l'arithmétique SQL",
              "prompt": "Si la colonne `quantity` est NULL pour une ligne, quel sera le résultat de `quantity * unit_price` pour cette ligne ?",
              "hint": "Réfléchissez à la façon dont SQL gère l'arithmétique avec des valeurs manquantes.",
              "help": {
                "concept": "En SQL, toute opération arithmétique impliquant la valeur manquante donne la valeur manquante.",
                "hint_1": "la valeur manquante dans les calculs donne un résultat manquant.",
                "hint_2": "SQL considère la valeur manquante comme 'inconnue', donc le résultat ne peut pas être déterminé."
              },
              "template": "Le résultat sera : ___",
              "choices": [
                "0",
                "NULL",
                "unit_price",
                "quantity"
              ]
            }
          }
        },
        "multiplying-and-dividing": {
          "label": "Multiplication et division",
          "summary": "Multiplication et division dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Multiplier des colonnes en SQL"
            },
            "sketch1": {
              "title": "Diviser des colonnes en SQL"
            },
            "sketch2": {
              "title": "Utiliser des alias pour la lisibilité"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer le total de ligne pour chaque commande",
              "prompt": "Écrivez une requête SQL pour sélectionner les champs `id`, `quantity`, `unit_price` et une nouvelle colonne appelée `line_total` (qui est `quantity` multiplié par `unit_price`) de la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q2": {
              "title": "Calculer le prix unitaire moyen par commande",
              "prompt": "Écrivez une requête SQL pour sélectionner les champs `id`, `quantity`, `unit_price` et une nouvelle colonne appelée `avg_price` qui divise la valeur totale de la commande (`quantity * unit_price`) par la `quantity` pour chaque commande.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q3": {
              "title": "But de l'utilisation des alias dans les colonnes calculées",
              "prompt": "Pourquoi devriez-vous utiliser le mot-clé `AS` pour donner un alias à une colonne calculée en SQL ?",
              "hint": "Pensez à l'apparence du résultat et à la façon dont vous faites référence aux colonnes.",
              "help": {
                "concept": "Les alias rendent votre jeu de résultats plus lisible et vous permettent de faire référence aux colonnes calculées par un nom clair.",
                "hint_1": "Sans alias, le nom de la colonne est l'expression complète.",
                "hint_2": "Les alias améliorent la lisibilité et facilitent l'utilisation de la colonne dans d'autres requêtes."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4": {
              "title": "Identifier les utilisations valides de la multiplication et de la division en SQL",
              "prompt": "Lesquelles des propositions suivantes sont des façons valides d'utiliser la multiplication et la division dans une instruction SELECT en SQL ? Cochez toutes les réponses valides.",
              "hint": "Considérez à la fois les opérations colonne à colonne et colonne à constante.",
              "help": {
                "concept": "SQL permet les opérations arithmétiques entre colonnes, entre une colonne et une constante, ou entre constantes.",
                "hint_1": "Vous pouvez multiplier ou diviser des colonnes, ou utiliser des constantes dans les expressions.",
                "hint_2": "Cherchez les options qui utilisent une syntaxe SQL valide pour l'arithmétique dans SELECT."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5": {
              "title": "Choisir le bon opérateur pour la division",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l'énoncé.",
              "hint": "Pensez au symbole utilisé pour la division en SQL.",
              "help": {
                "concept": "SQL utilise les symboles arithmétiques standards pour les opérations, y compris la division.",
                "hint_1": "C'est le même symbole qu'en mathématiques de base pour la division.",
                "hint_2": "Cherchez le symbole qui sépare le numérateur et le dénominateur."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "/",
                "*",
                "+",
                "-"
              ]
            }
          }
        },
        "number-functions": {
          "label": "Fonctions numériques",
          "summary": "Fonctions numériques dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Quelles sont les fonctions numériques en SQL ?"
            },
            "sketch1": {
              "title": "Utiliser les opérations arithmétiques et les fonctions numériques ensemble"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1-code-input": {
              "title": "Calculer et arrondir la valeur totale de la commande",
              "prompt": "Écrivez une requête SQL pour sélectionner l'`id` et la valeur totale de chaque commande (quantité multipliée par unit_price), arrondie à l'entier le plus proche. Nommez la colonne arrondie `rounded_total`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, \n       -- votre code ici\nFROM orders;"
            },
            "q2-code-input": {
              "title": "Trouver le prix unitaire minimum",
              "prompt": "Écrivez une requête SQL pour trouver le prix unitaire minimum dans la table `orders`. Nommez la colonne résultat `min_price`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT -- votre code ici\nFROM orders;"
            },
            "q3-single-choice": {
              "title": "Quelle fonction SQL retourne la valeur absolue d'un nombre ?",
              "prompt": "Laquelle des fonctions SQL suivantes retourne la valeur absolue d'un nombre ?",
              "hint": "Réfléchissez à la fonction qui enlève le signe d'un nombre.",
              "help": {
                "concept": "La fonction ABS() retourne la valeur non négative d'un nombre, quel que soit son signe d'origine.",
                "hint_1": "Cherchez la fonction qui donne toujours un résultat positif.",
                "hint_2": "Elle est souvent utilisée pour transformer des nombres négatifs en positifs."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4-multi-choice": {
              "title": "Lesquelles des fonctions suivantes sont des fonctions numériques en SQL ?",
              "prompt": "Sélectionnez toutes les options qui sont des fonctions numériques en SQL.",
              "hint": "Pensez aux fonctions qui opèrent sur des données numériques.",
              "help": {
                "concept": "Les fonctions numériques effectuent des calculs ou des transformations sur des valeurs numériques, comme l'arrondi, la recherche de minimums ou l'obtention de valeurs absolues.",
                "hint_1": "Considérez des fonctions comme ROUND, MIN et ABS.",
                "hint_2": "Écartez les fonctions qui ne travaillent qu'avec du texte ou des dates."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5-fill-blank-choice": {
              "title": "Complétez : Arrondir une colonne calculée",
              "prompt": "Complétez l'expression SQL pour arrondir le résultat de la multiplication de quantity par unit_price.",
              "hint": "Encapsulez la multiplication dans une fonction d'arrondi.",
              "help": {
                "concept": "Pour arrondir une valeur calculée, utilisez la fonction ROUND() et placez l'expression à l'intérieur des parenthèses.",
                "hint_1": "La fonction doit ressembler à ROUND(expression).",
                "hint_2": "L'expression à l'intérieur doit être quantity * unit_price."
              },
              "template": "SELECT id, _____ AS rounded_total FROM orders;",
              "choices": [
                "ROUND(quantity * unit_price)",
                "MIN(quantity * unit_price)",
                "ABS(quantity * unit_price)",
                "SUM(quantity * unit_price)"
              ]
            }
          }
        },
        "renaming-outputs": {
          "label": "Renommer les sorties",
          "summary": "Renommer les sorties dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Pourquoi renommer les sorties ?"
            },
            "sketch1": {
              "title": "Syntaxe des alias"
            },
            "sketch2": {
              "title": "Exemple pratique"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Renommer une colonne calculée",
              "prompt": "Écrivez une requête SQL pour sélectionner `customer_name` et la valeur totale de chaque commande (quantité multipliée par unit_price) depuis la table `orders`. Nommez la colonne calculée `order_value`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT customer_name, \n       \nFROM orders;"
            },
            "q2": {
              "title": "Plusieurs alias dans une requête",
              "prompt": "Écrivez une requête SQL pour sélectionner `region` comme `sales_region` et `status` comme `order_status` depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT \nFROM orders;"
            },
            "q3": {
              "title": "But des alias",
              "prompt": "Pourquoi les alias (utilisation de AS) sont-ils utiles dans les requêtes SQL ?",
              "hint": "Pensez à la façon dont le résultat apparaît à quelqu'un qui lit les résultats.",
              "help": {
                "concept": "Les alias rendent les colonnes de résultat plus compréhensibles en leur donnant des noms explicites.",
                "hint_1": "Considérez comment les noms de colonnes apparaissent dans la table de sortie.",
                "hint_2": "Les alias aident à rendre les rapports ou les données exportées plus lisibles."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4": {
              "title": "Utilisations valides des alias",
              "prompt": "Lesquelles des propositions suivantes sont des utilisations valides des alias en SQL ? Sélectionnez toutes les réponses qui conviennent.",
              "hint": "Réfléchissez à l'endroit où les alias peuvent être appliqués dans une instruction SELECT.",
              "help": {
                "concept": "Les alias peuvent être utilisés pour renommer des colonnes, des expressions et même parfois des tables pour plus de clarté.",
                "hint_1": "Considérez à la fois les colonnes calculées et les colonnes classiques.",
                "hint_2": "Vous pouvez utiliser des alias pour les expressions et les colonnes dans la liste SELECT."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5": {
              "title": "Syntaxe des alias",
              "prompt": "Complétez l'espace vide pour renommer correctement la colonne `category` en `product_type` dans une instruction SELECT.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "L'espace vide doit être complété par le terme SQL qui correspond à la fonction que l'instruction cherche à accomplir.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans l'instruction.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de l'instruction."
              },
              "template": "SELECT category ___ product_type FROM orders;",
              "choices": [
                "AS",
                "INTO",
                "=",
                "LIKE"
              ]
            }
          }
        },
        "renaming-result-columns": {
          "label": "Renommer les colonnes de résultat",
          "summary": "Apprenez à renommer les colonnes dans les résultats de requêtes SQL à l'aide d'alias de colonnes, pour rendre votre sortie plus lisible et prête à être présentée.",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'un alias de colonne ?"
            },
            "sketch1": {
              "title": "Syntaxe et utilisation des alias"
            },
            "sketch2": {
              "title": "Alias avec expressions et fonctions"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "quiz-1-alias-calc-column": {
              "title": "Créer une colonne calculée avec un alias",
              "prompt": "Écrivez une requête SQL pour sélectionner l'`id` et une colonne calculée pour la valeur totale de chaque commande (quantité multipliée par prix_unitaire), en nommant la nouvelle colonne `order_total`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, \n       \nFROM orders;"
            },
            "quiz-2-alias-header": {
              "title": "But des alias de colonnes",
              "prompt": "Pourquoi les alias de colonnes sont-ils utiles dans les requêtes SQL ?",
              "hint": "Pensez à l'apparence de la sortie et à la façon dont cela aide les lecteurs.",
              "help": {
                "concept": "Les alias de colonnes rendent les résultats de requête plus faciles à lire et à comprendre en fournissant des en-têtes clairs et descriptifs.",
                "hint_1": "Les alias aident à rendre les colonnes calculées ou complexes plus compréhensibles.",
                "hint_2": "Ils sont particulièrement utiles pour les rapports et les présentations."
              },
              "options": {
                "a": "Une commande",
                "b": "Un nom de table"
              }
            },
            "quiz-3-multi-alias-usage": {
              "title": "Où pouvez-vous utiliser des alias de colonnes ?",
              "prompt": "Dans quelles situations les alias de colonnes sont-ils utiles ? Sélectionnez toutes les réponses qui conviennent.",
              "hint": "Pensez aux moments où vous souhaitez rendre les résultats plus clairs ou plus présentables.",
              "help": {
                "concept": "Les alias de colonnes sont utiles pour renommer les colonnes dans la sortie, en particulier pour les colonnes calculées, les fonctions ou lors de la préparation de données pour des rapports.",
                "hint_1": "Considérez les cas où le nom de colonne d'origine n'est pas clair ou lors de l'utilisation d'expressions.",
                "hint_2": "Les alias ne servent pas à modifier le schéma réel de la table."
              },
              "options": {
                "a": "Une commande",
                "b": "Un nom de table"
              }
            },
            "quiz-4-alias-fill-blank": {
              "title": "Complétez : syntaxe de l'alias",
              "prompt": "Complétez la requête SQL pour renommer la colonne `region` en `area` dans le résultat.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "Le blanc doit être complété par le terme SQL qui correspond à l'action que la requête cherche à effectuer.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans la requête.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de la requête."
              },
              "template": "SELECT region ___ area FROM orders;",
              "choices": [
                "AS",
                "=",
                "INTO",
                "TO"
              ]
            },
            "quiz-5-alias-multiple-columns": {
              "title": "Utiliser des alias pour plusieurs colonnes",
              "prompt": "Écrivez une requête SQL pour sélectionner `customer_name` comme `buyer`, `category` comme `item_type`, et `status` comme `order_status` depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT \nFROM orders;"
            }
          }
        },
        "simple-report-queries": {
          "label": "Requêtes de rapport simples",
          "summary": "Apprenez à écrire des requêtes SQL de rapport simples en utilisant des colonnes calculées et des expressions, y compris l'utilisation d'alias pour plus de clarté et l'arithmétique de base dans les instructions SELECT.",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une colonne calculée ?"
            },
            "sketch1": {
              "title": "Utiliser des alias pour plus de clarté"
            },
            "sketch2": {
              "title": "Expressions dans SELECT"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer les totaux de ligne pour chaque commande",
              "prompt": "Écrivez une requête SQL pour afficher l'`id` de chaque commande, le `customer_name`, et une colonne calculée nommée `line_total` qui multiplie `quantity` par `unit_price` de la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q2": {
              "title": "Afficher le prix remisé pour chaque commande",
              "prompt": "Écrivez une requête SQL pour afficher `id`, `unit_price` et une nouvelle colonne appelée `discounted_price` qui montre le prix unitaire avec une remise de 15 % (c'est-à-dire unit_price * 0.85) pour chaque commande dans la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q3": {
              "title": "But des alias dans les rapports SQL",
              "prompt": "Pourquoi les alias (utilisation de AS) sont-ils utiles lors de la rédaction de requêtes de rapport SQL ?",
              "hint": "Pensez à l'apparence de la sortie pour quelqu'un qui lit le rapport.",
              "help": {
                "concept": "Les alias rendent les colonnes du résultat plus faciles à comprendre en leur donnant des noms clairs et descriptifs.",
                "hint_1": "Les alias aident à rendre les noms de colonnes plus lisibles dans la sortie.",
                "hint_2": "Les alias sont particulièrement utiles lors de l'utilisation d'expressions ou de colonnes calculées."
              },
              "options": {
                "a": "a. Ils vous permettent de masquer des colonnes dans la sortie.",
                "b": "b. Ils rendent les noms de colonnes dans le résultat plus clairs et plus lisibles.",
                "c": "c. Ils accélèrent l'exécution de la requête.",
                "d": "d. Ils sont obligatoires pour chaque colonne."
              }
            },
            "q4": {
              "title": "Lesquelles des expressions suivantes sont valides pour des colonnes calculées en SQL ?",
              "prompt": "Sélectionnez toutes les options qui montrent des façons valides de créer des colonnes calculées dans une instruction SELECT.",
              "hint": "Cherchez des expressions qui utilisent l'arithmétique ou combinent des colonnes.",
              "help": {
                "concept": "Une colonne calculée peut utiliser des opérations arithmétiques ou des fonctions sur des colonnes existantes dans la clause SELECT.",
                "hint_1": "Vérifiez la bonne utilisation de l'arithmétique et des noms de colonnes.",
                "hint_2": "Les expressions valides utilisent des colonnes existantes et de l'arithmétique ou des fonctions, et peuvent être renommées avec un alias."
              },
              "options": {
                "a": "a. quantity * unit_price AS total",
                "b": "b. unit_price + 10 AS increased_price",
                "c": "c. SELECT * FROM orders",
                "d": "d. quantity / 2 AS half_quantity"
              }
            },
            "q5": {
              "title": "Complétez : syntaxe de colonne calculée",
              "prompt": "Complétez l'instruction SQL pour créer une colonne calculée affichant le double de la quantité sous le nom `double_quantity` :\n\nSELECT id, quantity, ______ AS double_quantity FROM orders;",
              "hint": "Multipliez la colonne quantity par 2.",
              "help": {
                "concept": "Pour créer une colonne calculée, utilisez une opération arithmétique sur une colonne existante et donnez-lui un alias avec AS.",
                "hint_1": "Le blanc doit être une expression qui double la quantité.",
                "hint_2": "Utilisez le terme manquant dans le blanc."
              },
              "template": "SELECT id, quantity, {{blank}} AS double_quantity FROM orders;",
              "choices": [
                "quantity * 2",
                "quantity + 2",
                "2 * quantity",
                "quantity / 2"
              ]
            }
          }
        },
        "string-functions": {
          "label": "Fonctions de chaîne de caractères",
          "summary": "Fonctions de chaîne dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une fonction de chaîne en SQL ?"
            },
            "sketch1": {
              "title": "Utiliser les fonctions de chaîne dans SELECT"
            },
            "sketch2": {
              "title": "Combiner fonctions de chaîne et alias"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Afficher les noms des clients en majuscules",
              "prompt": "Écrivez une requête SQL pour afficher le nom de chaque client en majuscules ainsi que son nom d'origine depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT customer_name, \n       -- votre code ici\nFROM orders;"
            },
            "code-2": {
              "title": "Extraire le code de la région",
              "prompt": "Écrivez une requête SQL pour afficher chaque région et les deux premières lettres de la région en minuscules, nommées `region_code`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT region, \n       -- votre code ici\nFROM orders;"
            },
            "single-1": {
              "title": "But de la fonction LENGTH()",
              "prompt": "Que retourne la fonction LENGTH() lorsqu'elle est utilisée sur une colonne texte en SQL ?",
              "hint": "Elle compte quelque chose à propos du texte.",
              "help": {
                "concept": "LENGTH() retourne le nombre de caractères dans une chaîne, pas de mots ni de lignes.",
                "hint_1": "Pensez au nombre de lettres ou de symboles dans le texte.",
                "hint_2": "LENGTH() concerne la taille de la valeur texte, pas de la table."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "multi-1": {
              "title": "Quelles sont les fonctions de chaîne valides dans SQLite ?",
              "prompt": "Sélectionnez toutes les fonctions ci-dessous qui sont des fonctions de chaîne valides dans SQLite.",
              "hint": "Certaines fonctions changent la casse, d'autres extraient des parties du texte.",
              "help": {
                "concept": "Les fonctions de chaîne opèrent sur des valeurs texte. SUM() est une fonction numérique d'agrégation, pas une fonction de chaîne.",
                "hint_1": "Cherchez des fonctions qui travaillent avec du texte, pas des nombres.",
                "hint_2": "UPPER, LOWER, SUBSTR et LENGTH sont toutes des fonctions pour les chaînes."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "fill-1": {
              "title": "Fonction pour extraire une partie d'une chaîne",
              "prompt": "Quelle fonction extrait une sous-chaîne d'une valeur texte dans SQLite ?",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "Le blanc doit être complété par le terme SQL qui correspond à la tâche que l'énoncé cherche à accomplir.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans l'énoncé.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de l'énoncé."
              },
              "template": "Pour obtenir les trois premières lettres d'une région, utilisez ____ (region, 1, 3).",
              "choices": [
                "SUBSTR",
                "LENGTH",
                "UPPER",
                "SUM"
              ]
            }
          }
        },
        "total-price-calculations": {
          "label": "Calculs du prix total",
          "summary": "Apprenez à calculer les prix totaux à l'aide d'expressions arithmétiques et d'alias en SQL, avec une pratique concrète sur la table 'orders' du jeu de données sales_kpi.",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une colonne calculée ?"
            },
            "sketch1": {
              "title": "Pourquoi utiliser des alias ?"
            },
            "sketch2": {
              "title": "Gérer les NULL dans les expressions"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1-calc-total-price": {
              "title": "Calculer le prix total pour chaque commande",
              "prompt": "Écrivez une requête SQL pour sélectionner les champs `id`, `quantity`, `unit_price` et une colonne calculée nommée `total_price` (qui est `quantity * unit_price`) depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q2-discounted-price": {
              "title": "Calculer le prix total après remise",
              "prompt": "Écrivez une requête SQL pour sélectionner `customer_name`, `quantity`, `unit_price` et une colonne calculée nommée `discounted_total` qui multiplie `quantity * unit_price * 0.9` (appliquant une remise de 10%) depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT customer_name, quantity, unit_price\nFROM orders;"
            },
            "q3-alias-purpose": {
              "title": "But de l'utilisation des alias",
              "prompt": "Pourquoi utiliser un alias (AS) lors de la création de colonnes calculées en SQL ?",
              "hint": "Pensez à l'apparence du résultat.",
              "help": {
                "concept": "Les alias rendent les colonnes de résultat plus lisibles et compréhensibles, surtout pour les expressions.",
                "hint_1": "Sans alias, les noms de colonnes peuvent être confus ou difficiles à lire.",
                "hint_2": "Les alias aident à rendre les rapports et requêtes plus clairs pour les utilisateurs."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4-multi-choice-expressions": {
              "title": "Identifier des expressions SQL valides",
              "prompt": "Lesquelles des propositions suivantes sont des expressions SQL valides pour créer une colonne calculée dans la table `orders` ? Sélectionnez toutes les réponses valides.",
              "hint": "Cherchez des expressions utilisant des colonnes existantes et une syntaxe SQL valide.",
              "help": {
                "concept": "Une expression SQL valide peut utiliser des opérations arithmétiques, des fonctions ou combiner des colonnes dans SELECT.",
                "hint_1": "Vérifiez si l'expression utilise des colonnes de la table et des opérateurs valides.",
                "hint_2": "Les expressions peuvent inclure des opérations arithmétiques ou des fonctions, mais doivent utiliser les bons noms de colonnes."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5-fill-blank-alias": {
              "title": "Compléter l'alias",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l'énoncé.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact.",
              "help": {
                "concept": "Le blanc doit être complété par le terme SQL qui correspond à la fonction que l'énoncé cherche à accomplir.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans l'énoncé.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de l'énoncé."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "AS",
                "BY",
                "IN",
                "ON"
              ]
            }
          }
        },
        "what-aliases-are": {
          "label": "Ce que sont les alias",
          "summary": "Ce que sont les alias dans les colonnes calculées et les expressions SQL",
          "cards": {
            "sketch0": {
              "title": "Introduction aux alias en SQL"
            },
            "sketch1": {
              "title": "Pourquoi utiliser des alias ?"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Créer une colonne calculée avec un alias",
              "prompt": "Écrivez une requête SQL pour sélectionner le `customer_name` et la valeur totale de chaque commande (quantité multipliée par unit_price) depuis la table `orders`. Nommez la colonne calculée `order_value` à l'aide d'un alias.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT customer_name, \n       quantity * unit_price AS order_value\nFROM orders;"
            },
            "q2": {
              "title": "Alias pour une colonne simple",
              "prompt": "Écrivez une requête SQL pour sélectionner la colonne `region` de la table `orders`, mais affichez-la sous le nom `area` dans le résultat à l'aide d'un alias.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT region AS area\nFROM orders;"
            },
            "q3": {
              "title": "But des alias de colonne",
              "prompt": "Pourquoi utiliseriez-vous un alias de colonne dans une requête SQL ?",
              "hint": "Pensez à la façon dont les résultats apparaissent à quelqu'un qui les lit.",
              "help": {
                "concept": "Les alias de colonne rendent les ensembles de résultats plus lisibles et compréhensibles en donnant aux colonnes des noms significatifs.",
                "hint_1": "Les alias aident à clarifier ce que représente une colonne.",
                "hint_2": "Ils sont particulièrement utiles pour les colonnes calculées ou lorsque les noms par défaut ne sont pas clairs."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q4": {
              "title": "Utilisations valides des alias",
              "prompt": "Lesquelles des utilisations suivantes des alias de colonne en SQL sont valides ? Sélectionnez toutes les réponses qui conviennent.",
              "hint": "Pensez aux colonnes calculées et aux colonnes régulières.",
              "help": {
                "concept": "Les alias peuvent être utilisés à la fois pour les colonnes calculées et pour renommer des colonnes existantes afin de clarifier le résultat.",
                "hint_1": "Vous pouvez utiliser des alias pour des expressions et pour des colonnes régulières.",
                "hint_2": "Si vous souhaitez renommer une colonne ou une expression dans votre résultat SELECT, vous pouvez utiliser un alias."
              },
              "options": {
                "a": "[object Object]",
                "b": "Une commande"
              }
            },
            "q5": {
              "title": "Syntaxe pour un alias de colonne",
              "prompt": "Complétez l'espace vide pour attribuer correctement un alias à une colonne calculée en SQL.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "L'espace vide doit être complété par le terme SQL qui correspond à l'action que la requête cherche à effectuer.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans la requête.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de la requête."
              },
              "template": "SELECT quantity * unit_price ___ total_price FROM orders;",
              "choices": [
                "AS",
                "WITH",
                "INTO",
                "ON"
              ]
            }
          }
        },
        "what-expressions-are": {
          "label": "Ce que sont les expressions",
          "summary": "Comprendre ce que sont les expressions en SQL, comment elles sont utilisées pour créer de nouvelles valeurs dans les requêtes, et pourquoi elles sont essentielles pour les colonnes calculées.",
          "cards": {
            "sketch0": {
              "title": "Qu'est-ce qu'une expression en SQL ?"
            },
            "sketch1": {
              "title": "Expressions avec fonctions et alias"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Calculer une nouvelle colonne à l'aide d'une expression",
              "prompt": "Écrivez une requête SQL pour sélectionner `id`, `quantity`, `unit_price`, et une nouvelle colonne appelée `line_total` qui multiplie `quantity` par `unit_price` depuis la table `orders`.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id, quantity, unit_price\n-- Ajoutez votre expression ici\nFROM orders;"
            },
            "code-2": {
              "title": "Utiliser une expression avec une fonction",
              "prompt": "Écrivez une requête SQL pour sélectionner `id` et une nouvelle colonne appelée `double_quantity` qui est le double de la valeur de `quantity` pour chaque commande.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Pensez au rôle ou à l'idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l'exercice vous demande de faire."
              },
              "starterCode": "SELECT id,\n-- Votre expression ici\nFROM orders;"
            },
            "single-1": {
              "title": "Identifier une expression",
              "prompt": "Laquelle des propositions suivantes est un exemple d'expression en SQL ?",
              "hint": "Cherchez un calcul ou une transformation utilisant des colonnes ou des valeurs.",
              "help": {
                "concept": "Une expression est toute combinaison valide de colonnes, valeurs, opérateurs ou fonctions qui retourne une seule valeur.",
                "hint_1": "Les expressions utilisent souvent l'arithmétique ou des fonctions.",
                "hint_2": "Multiplier deux colonnes est un exemple classique d'expression."
              },
              "options": {
                "a": "a. SELECT * FROM orders;",
                "b": "b. quantity * unit_price",
                "c": "c. FROM orders",
                "d": "d. AS line_total"
              }
            },
            "multi-1": {
              "title": "Lesquelles des propositions suivantes sont des expressions SQL valides ?",
              "prompt": "Sélectionnez toutes les options qui sont des expressions SQL valides.",
              "hint": "Les expressions peuvent être arithmétiques, des fonctions ou des références directes à des colonnes.",
              "help": {
                "concept": "Les expressions valides incluent les opérations arithmétiques, les appels de fonctions et même les références à une seule colonne.",
                "hint_1": "Pensez à ce qui peut apparaître dans une clause SELECT pour produire une valeur.",
                "hint_2": "Les calculs comme les appels de fonctions sont des expressions valides."
              },
              "options": {
                "a": "a. quantity + 10",
                "b": "b. ROUND(unit_price, 1)",
                "c": "c. orders",
                "d": "d. status"
              }
            },
            "fill-1": {
              "title": "Complétez : Résultat d'une expression",
              "prompt": "En SQL, une expression produit toujours ______.",
              "hint": "Que retourne une expression ?",
              "help": {
                "concept": "Une expression en SQL donne toujours le terme manquant.",
                "hint_1": "Pensez au résultat d'un calcul ou d'une fonction.",
                "hint_2": "Ce n'est ni une table ni un nom de colonne, mais un résultat unique."
              },
              "template": "En SQL, une expression produit toujours {blank}.",
              "choices": [
                "table",
                "valeur unique",
                "nom de colonne",
                "ligne"
              ]
            }
          }
        },
        "writing-readable-output": {
          "label": "Rédiger une sortie lisible",
          "summary": "Apprenez à utiliser des alias de colonnes et des expressions en SQL pour rendre les résultats de vos requêtes clairs et prêts à être présentés.",
          "cards": {
            "sketch0": {
              "title": "Pourquoi la lisibilité de la sortie est importante"
            },
            "sketch1": {
              "title": "Utiliser des alias de colonnes dans SELECT"
            },
            "sketch2": {
              "title": "Préparer les rapports pour la présentation"
            },
            "quiz": {
              "title": "Quiz"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calculer et nommer une nouvelle colonne",
              "prompt": "Écrivez une requête SQL pour afficher l’`id` de chaque commande, le `customer_name`, et la valeur totale de la commande sous le nom `line_total` (calculée comme `quantity * unit_price`).",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l’idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l’exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q2": {
              "title": "Formater la sortie avec des noms de colonnes lisibles",
              "prompt": "Écrivez une requête SQL pour afficher `customer_name` sous le nom « Customer Name » et `region` sous le nom « Region » pour toutes les commandes.",
              "hint": "Concentrez-vous sur le concept testé.",
              "help": {
                "concept": "Réfléchissez au rôle ou à l’idée testée plutôt que de répéter la formulation de la réponse.",
                "hint_1": "Éliminez les choix ou interprétations qui ne correspondent pas à la tâche.",
                "hint_2": "Choisissez le concept qui correspond le mieux à ce que l’exercice vous demande de faire."
              },
              "starterCode": "-- Écrivez votre requête ici"
            },
            "q3": {
              "title": "But des alias de colonnes",
              "prompt": "Pourquoi devriez-vous utiliser des alias de colonnes dans vos requêtes SQL ?",
              "hint": "Pensez à l’apparence de la sortie pour quelqu’un qui lit les résultats.",
              "help": {
                "concept": "Les alias de colonnes servent à améliorer la lisibilité des résultats de vos requêtes.",
                "hint_1": "Les alias influencent l’étiquetage des colonnes dans le résultat, pas la performance ni les types de données.",
                "hint_2": "Ils aident les autres à comprendre ce que chaque colonne représente."
              },
              "options": {
                "a": "Une commande",
                "b": "Un nom de table"
              }
            },
            "q4": {
              "title": "Identifier les utilisations valides des alias",
              "prompt": "Lesquelles des propositions suivantes sont des raisons valides d’utiliser des alias de colonnes ? (Cochez toutes les réponses qui s’appliquent)",
              "hint": "Considérez comment les alias affectent la sortie et la compréhension des résultats.",
              "help": {
                "concept": "Les alias aident à clarifier, formater et lever les ambiguïtés sur les colonnes dans les ensembles de résultats.",
                "hint_1": "Ils ne servent pas à filtrer, mais à nommer et clarifier.",
                "hint_2": "Pensez aux colonnes calculées, aux fonctions et à la lisibilité des rapports."
              },
              "options": {
                "a": "Une commande",
                "b": "Un nom de table"
              }
            },
            "q5": {
              "title": "Syntaxe pour attribuer un alias",
              "prompt": "Choisissez la meilleure valeur pour le premier blanc manquant dans l’énoncé.",
              "hint": "Concentrez-vous sur le concept SQL manquant plutôt que sur le mot exact manquant.",
              "help": {
                "concept": "Le blanc doit être complété par le terme SQL qui correspond à la fonction que l’énoncé cherche à réaliser.",
                "hint_1": "Réfléchissez à ce que la partie manquante est censée faire dans l’énoncé.",
                "hint_2": "Choisissez le terme SQL qui complète le mieux le sens de l’énoncé."
              },
              "template": "La première valeur manquante est [blank1].",
              "choices": [
                "AS",
                "BY",
                "WITH",
                "ON"
              ]
            }
          }
        }
      }
    }
  },
  "sketches": {
    "linux-terminal-fundamentals": {
      "linux-module-1-terminal-navigation": {
        "module-1-terminal-map-project": {
          "project-synopsis": {
            "title": "Résumé du projet « Notes de terrain sur la carte du terminal »",
            "bodyMarkdown": "Vous aidez l'équipe chargée de la gestion du parc à retracer un plan de sentiers existant avant une journée de bénévolat. Dans le cadre de ce projet, vous utiliserez `ls` pour voir ce qui est disponible, `cd` pour vous déplacer d'un sentier à l'autre, et `pwd` pour confirmer votre position. Chaque étape s'appuie sur l'espace de travail précédent ; concentrez-vous donc sur la recherche du bon emplacement plutôt que sur la création de nouveaux fichiers."
          }
        },
        "moving-around": {
          "sketch-1": {
            "title": "Quels sont les changements apportés par l'`cd` ?",
            "bodyMarkdown": "`cd` means **change directory**. A directory is just another word for a folder. When you run `cd`, you move your terminal's current location to a different folder.\n\nA good habit is to check where you are before and after moving:\n\n```bash\npwd\ncd projects\npwd\n```\n\nStep by step:\n\n- `pwd` prints your current folder.\n- `cd projects` moves into the `projects` folder if it exists in your current location.\n- The second `pwd` confirms the new location.\n\nExample:\n\n```bash\n/home/learner\ncd projects\n/home/learner/projects\n```\n\nThis matters because many terminal commands act on your **current folder**. If you are in the wrong place, `ls`, `touch`, `mkdir`, `cp`, or `mv` may affect the wrong files."
          },
          "sketch-2": {
            "title": "Sources : `..`, `.` et `~`",
            "bodyMarkdown": "Some `cd` targets are shortcuts:\n\n- `..` means **the parent folder**\n- `.` means **the current folder**\n- `~` means **your home folder**\n\nWorked example:\n\n```bash\npwd\ncd ..\npwd\ncd ~\npwd\n```\n\nLine by line:\n\n- The first `pwd` shows where you start.\n- `cd ..` moves up one level.\n- The next `pwd` shows the parent folder.\n- `cd ~` jumps to your home folder from anywhere.\n- The last `pwd` confirms that jump.\n\n`cd .` usually keeps you in the same place. It can still be useful when you are practicing path ideas and want to show “stay here.”"
          },
          "sketch-3": {
            "title": "Vérifier les voies de circulation en toute sécurité avant de se déplacer",
            "bodyMarkdown": "A path tells the terminal **which folder** you want. Before using `cd`, it helps to inspect the current folder with `ls`.\n\nExample:\n\n```bash\npwd\nls\ncd reports\nls\n```\n\nWhat happens:\n\n- `pwd` shows your starting location.\n- `ls` lists folders and files there.\n- `cd reports` moves into the `reports` folder.\n- `ls` now shows what is inside `reports`.\n\nIf `reports` is not listed before you try `cd reports`, the command will fail because that folder is not in your current location. Checking with `ls` first helps you move confidently and avoid mistakes."
          }
        },
        "what-the-terminal-is": {
          "terminal-basics": {
            "title": "Le terminal, c'est comme une conversation avec votre ordinateur",
            "bodyMarkdown": "The terminal is a text-based place where you **type commands** and the computer **responds with output**. Instead of clicking folders and buttons, you tell the computer what to do with short instructions.\n\nA command usually has two parts:\n\n1. the command name\n2. the result the computer shows back to you\n\nFor example:\n\n```bash\npwd\n```\n\nIf you run `pwd`, the computer prints your current location in the workspace. Line by line, here is what is happening:\n\n- `pwd` is the command you type\n- it stands for **print working directory**\n- the terminal responds by showing the folder you are currently in\n\nAnother example:\n\n```bash\nls\n```\n\n- `ls` is the command you type\n- it lists what is in the current folder\n- the terminal responds with file and folder names\n\nImagine you are helping organize a small project folder for a school club. In a file explorer, you might click around to see where you are. In the terminal, you can ask directly with `pwd` and `ls`. The terminal is not magic—it is just a faster, text-based way to inspect and control your workspace."
          },
          "commands-and-output": {
            "title": "Les commandes sont des instructions, et la sortie correspond à la réponse",
            "bodyMarkdown": "When you use the terminal, you are giving the computer a specific instruction. The computer then shows a result, often as text.\n\nHere is a simple worked example:\n\n```bash\nls\n```\n\nSuppose the current folder contains two items named `notes.txt` and `photos`. The terminal output might look like this:\n\n```bash\nnotes.txt\nphotos\n```\n\nThat means:\n\n- you typed `ls`\n- the computer checked the current folder\n- it printed the names of the items inside it\n\nNow compare that with:\n\n```bash\npwd\n```\n\nPossible output:\n\n```bash\n/home/learner/project\n```\n\nThis tells you **where you are**, not **what is inside**. That difference matters:\n\n- `pwd` answers: “What folder am I in?”\n- `ls` answers: “What is in this folder?”\n\nIf you are organizing a newsletter workspace, `pwd` helps you confirm you are in the `drafts` folder, while `ls` helps you see whether files like `intro.txt` or `outline.txt` are there."
          },
          "why-terminal-matters": {
            "title": "Pourquoi les gens utilisent-ils le terminal ?",
            "bodyMarkdown": "People use the terminal because it gives clear, direct control over files and folders. It is especially useful when you want to inspect a workspace quickly or repeat the same kinds of actions.\n\nFor a beginner, the most important idea is this: the terminal helps you **navigate** and **inspect** your workspace with commands.\n\nHere is a short sequence:\n\n```bash\npwd\nls\n```\n\nStep by step:\n\n- `pwd` shows your current folder\n- `ls` shows what is inside that folder\n\nTogether, these commands help you stay oriented.\n\nImagine you are a junior assistant preparing folders for an event team. You might need to confirm that you are inside `event-plan` before checking whether `schedule.txt` and `guests.txt` exist. In the terminal, that workflow is quick and precise.\n\nThe terminal does not replace thinking. You still decide what you want to inspect or change. The terminal is simply the tool that carries out your commands and reports back."
          }
        },
        "where-am-i": {
          "where-am-i-basics": {
            "title": "Utilisez `pwd` pour localiser votre position actuelle",
            "bodyMarkdown": "When you open the Linux terminal, you are always **somewhere** in the file system. The `pwd` command tells you exactly where you are.\n\n`pwd` stands for **print working directory**. A directory is another word for a folder, and your working directory is the folder you are currently using.\n\nFor example:\n\n```bash\npwd\n```\n\nPossible output:\n\n```bash\n/home/learner/projects\n```\n\nThat output is the full path to your current folder.\n\nStep by step:\n\n- `pwd` is the command you type.\n- The terminal prints the current folder path.\n- You do not change anything in the workspace by running `pwd`.\n\nImagine you are helping organize a small school newsletter workspace. Before creating or moving files, you should first check where you are. If `pwd` shows `/home/learner/newsletter`, then you know any next command will happen inside that folder unless you move somewhere else."
          },
          "list-files-with-ls": {
            "title": "Utilisez la commande « `ls` » pour afficher le contenu du dossier actuel.",
            "bodyMarkdown": "Once you know where you are, the next question is usually: **what is here?** That is what `ls` does.\n\n`ls` lists the contents of the current folder.\n\nExample:\n\n```bash\nls\n```\n\nPossible output:\n\n```bash\ndrafts\nimages\nnotes.txt\n```\n\nStep by step:\n\n- `ls` checks the folder you are currently in.\n- It prints the names of files and folders inside it.\n- Like `pwd`, it is an inspection command, so it does not create, move, or delete anything.\n\nIn a real story, suppose you are a volunteer checking a community event folder. If `pwd` says you are in `/home/learner/event-kit`, then `ls` might show folders like `posters` and `schedule`, plus a file like `todo.txt`. That helps you decide what to open or where to go next."
          },
          "pwd-and-ls-together": {
            "title": "Utilisez conjointement les sites `pwd` et `ls` pour vous repérer",
            "bodyMarkdown": "`pwd` and `ls` work best as a pair:\n\n1. Use `pwd` to confirm your location.\n2. Use `ls` to inspect what is inside that location.\n\nExample session:\n\n```bash\npwd\nls\n```\n\nPossible output:\n\n```bash\n/home/learner/reports\nsummary.txt\nweekly\narchive\n```\n\nRead this carefully:\n\n- `pwd` tells you the current folder is `/home/learner/reports`.\n- `ls` then shows that this folder contains `summary.txt`, `weekly`, and `archive`.\n- Because both commands are safe inspection commands, they are great first steps when you feel unsure.\n\nA beginner-friendly habit is: **before changing anything, check location first, then check contents**. That habit helps prevent mistakes, especially when several folders have similar names."
          }
        }
      },
      "linux-module-2-files-and-folders": {
        "copy-move-rename": {
          "sketch-1": {
            "title": "Copier des fichiers avec cp",
            "bodyMarkdown": "`cp` makes a duplicate of a file and leaves the original in place. This is useful when you want a backup or when you need the same content in a second location.\n\nWorked example:\n\n```bash\ncp notes.txt backup-notes.txt\n```\n\nStep by step:\n- `cp` is the copy command.\n- `notes.txt` is the source file you already have.\n- `backup-notes.txt` is the new file that will be created.\n\nAfter this command, both files exist.\n\nIf you copy into a folder, the file keeps its name unless you give a new one:\n\n```bash\ncp notes.txt archive/notes.txt\n```\n\nThat command copies `notes.txt` into the `archive` folder. The original file still stays where it started."
          },
          "sketch-2": {
            "title": "Déplacer des fichiers et des dossiers avec la commande mv",
            "bodyMarkdown": "`mv` changes where a file or folder lives. Unlike `cp`, it does not leave the original behind.\n\nWorked example:\n\n```bash\nmv draft.txt school/\n```\n\nStep by step:\n- `mv` is the move command.\n- `draft.txt` is the item you want to relocate.\n- `school/` is the destination folder.\n\nAfter the command, `draft.txt` is no longer in the old location. It is now inside `school/`.\n\nYou can also move folders:\n\n```bash\nmv notes archive/\n```\n\nThat places the whole `notes` folder inside `archive`."
          },
          "sketch-3": {
            "title": "Renommer avec mv",
            "bodyMarkdown": "In Linux, renaming is also done with `mv`. You are moving a file from its old name to its new name in the same folder.\n\nWorked example:\n\n```bash\nmv todo.txt tasks.txt\n```\n\nStep by step:\n- `mv` starts the rename.\n- `todo.txt` is the current name.\n- `tasks.txt` is the new name.\n\nAfter the command, `todo.txt` no longer exists, and `tasks.txt` exists instead.\n\nYou can rename while moving too:\n\n```bash\nmv draft.txt projects/final.txt\n```\n\nThat changes both the location and the name in one command."
          }
        },
        "creating-folders-and-files": {
          "sketch-1": {
            "title": "Créer un dossier à l'aide de la commande mkdir",
            "bodyMarkdown": "`mkdir` creates a new folder in your current location. This is useful when you want to start organizing a project instead of keeping everything in one place.\n\nFor example, if you are setting up school notes, you might create a folder named `notes`:\n\n```bash\nmkdir notes\nls\n```\n\nStep by step:\n- `mkdir notes` creates a folder called `notes`.\n- `ls` lists what is in the current folder so you can confirm that `notes` now exists.\n\nIf `notes` appears in the list, the command worked. A common habit is to run `ls` right after creating something so you can verify the workspace changed the way you expected."
          },
          "sketch-2": {
            "title": "Créer des dossiers imbriqués avec mkdir -p",
            "bodyMarkdown": "Sometimes you need several folders inside each other. `mkdir -p` creates the whole path at once.\n\nExample:\n\n```bash\nmkdir -p school/history/week1\nls school\n```\n\nStep by step:\n- `mkdir -p school/history/week1` creates `school`, then `history` inside it, then `week1` inside that.\n- The `-p` option prevents you from having to create each level one by one.\n- `ls school` lets you inspect the first folder in that path.\n\nWithout `-p`, trying to create a deep path all at once usually fails if the parent folders do not exist yet."
          },
          "sketch-3": {
            "title": "Créer des fichiers vides avec la commande « touch »",
            "bodyMarkdown": "`touch` creates an empty file when that file does not already exist. This is a fast way to set up placeholders such as notes, drafts, or checklists.\n\nExample:\n\n```bash\ntouch todo.txt ideas.txt\nls\n```\n\nStep by step:\n- `touch todo.txt ideas.txt` creates two empty files.\n- `ls` shows both file names in the current folder.\n\nYou can also combine folders and files in a small project setup. For example, after creating a `school` folder, you might create `school/reading-list.txt` so the folder already contains a file you plan to use."
          }
        },
        "module-2-notes-organizer-project": {
          "project-synopsis": {
            "title": "Organisateur de notes de groupe d'étude",
            "bodyMarkdown": "Vous préparez un transfert de fichiers en bon état pour un groupe d'étude. Créez un espace de réception, triez les notes dans des dossiers par cours, conservez une sauvegarde et indiquez clairement que le travail est prêt.\n\nVous réaliserez cette tâche en suivant les étapes d'un projet interconnecté. Chaque étape s'appuie sur l'espace de travail de l'étape précédente ; veillez donc à ne pas supprimer les livrables antérieurs."
          }
        },
        "viewing-file-contents": {
          "sketch-1": {
            "title": "Lire un fichier entier avec cat",
            "bodyMarkdown": "`cat` prints the contents of a text file to the terminal. It is useful when the file is short and you want to see everything at once.\n\nExample:\n\n```bash\ncat notes.txt\n```\n\nIf `notes.txt` contains:\n\n```text\nBuy folders\nReview chapter 2\nEmail project partner\n```\n\nthen `cat notes.txt` shows all three lines in the terminal.\n\nStep by step:\n- `cat` is the command.\n- `notes.txt` is the file you want to read.\n- The terminal prints the file exactly as it is stored.\n\nUse `cat` for quick inspection of small text files. For longer files, `head` and `tail` are often easier to use."
          },
          "sketch-2": {
            "title": "Prévisualiser le début ou la fin avec « head » et « tail »",
            "bodyMarkdown": "Parfois, vous n’avez pas besoin du fichier dans son intégralité. `head` affiche la première partie d’un fichier, et `tail` affiche la dernière partie.\n\nExemple :\n\n```bash\nhead reading-log.txt\ntail reading-log.txt\n```\n\nSi `reading-log.txt` comporte de nombreuses lignes, `head` vous permet de voir comment il commence, tandis que `tail` vous permet de consulter les entrées les plus récentes ou les dernières.\n\nPour une approche adaptée aux débutants :\n- `head` = début du fichier\n- `tail` = fin du fichier\n\nExemple concret :\n\n```text\nMonday\nTuesday\nWednesday\nThursday\nFriday\nSaturday\nSunday\n```\n\n- `head` afficherait les premières lignes, en commençant par `Monday`.\n- `tail` afficherait les dernières lignes, en terminant par `Sunday`.\n\nCes commandes sont particulièrement utiles lorsqu’un fichier est trop long pour être lu confortablement avec `cat`."
          },
          "sketch-3": {
            "title": "Compter les lignes, les mots et les caractères avec wc",
            "bodyMarkdown": "`wc`\n\nfournit des statistiques sur un fichier. Elle est souvent utilisée pour compter le nombre de lignes, de mots et de caractères dans un texte.\n\nExemple :\n\n```bash\nwc announcement.txt\n```\n\nUn résultat pourrait ressembler à ceci :\n\n```text\n3 12 68 announcement.txt\n```\n\n\n\nCela signifie :\n-`3`\n\nlignes\n-`12`\n\nmots\n-`68`\n\ncaractères\n\nIl n’est pas nécessaire de mémoriser d’emblée la position de chaque chiffre. L’idée principale est que`wc`\n\nrésume la quantité de texte contenue dans le fichier.\n\nExemple concret :\n\nSi`announcement.txt`\n\ncontient trois phrases courtes,`wc announcement.txt`\n\nvous indique rapidement que le fichier est court sans afficher l’intégralité du texte.\n\nCela s’avère utile pour vérifier la longueur d’une note, comparer des fichiers ou confirmer qu’un fichier contient bien la quantité de contenu attendue."
          }
        }
      },
      "linux-module-3-final-capstone": {
        "final-capstone-file-room-handoff": {
          "capstone-synopsis": {
            "title": "Transfert de la salle des archives communautaires",
            "bodyMarkdown": "Vous êtes le dernier assistant chargé de la gestion des dossiers pour un événement communautaire. Vérifiez la boîte de réception, triez les dossiers importants, sauvegardez l'ordre du jour, passez en revue le transfert de tâches, débarrassez-vous des éléments superflus et indiquez que tout est prêt.\n\nVous réaliserez cette tâche en suivant les étapes interconnectées du projet. Chaque étape s'appuie sur l'espace de travail précédent ; veillez donc à ne pas supprimer les livrables antérieurs."
          }
        }
      }
    },
    "linux--linux-terminal-fundamentals--draft": {
      "linux-module-1-terminal-navigation": {
        "what-the-terminal-is": {
          "terminal-basics": {
            "title": "Le terminal, c'est comme une conversation avec votre ordinateur",
            "bodyMarkdown": "The terminal is a text-based place where you **type commands** and the computer **responds with output**. Instead of clicking folders and buttons, you tell the computer what to do with short instructions.\n\nA command usually has two parts:\n\n1. the command name\n2. the result the computer shows back to you\n\nFor example:\n\n```bash\npwd\n```\n\nIf you run `pwd`, the computer prints your current location in the workspace. Line by line, here is what is happening:\n\n- `pwd` is the command you type\n- it stands for **print working directory**\n- the terminal responds by showing the folder you are currently in\n\nAnother example:\n\n```bash\nls\n```\n\n- `ls` is the command you type\n- it lists what is in the current folder\n- the terminal responds with file and folder names\n\nImagine you are helping organize a small project folder for a school club. In a file explorer, you might click around to see where you are. In the terminal, you can ask directly with `pwd` and `ls`. The terminal is not magic—it is just a faster, text-based way to inspect and control your workspace."
          },
          "commands-and-output": {
            "title": "Les commandes sont des instructions, et la sortie correspond à la réponse",
            "bodyMarkdown": "When you use the terminal, you are giving the computer a specific instruction. The computer then shows a result, often as text.\n\nHere is a simple worked example:\n\n```bash\nls\n```\n\nSuppose the current folder contains two items named `notes.txt` and `photos`. The terminal output might look like this:\n\n```bash\nnotes.txt\nphotos\n```\n\nThat means:\n\n- you typed `ls`\n- the computer checked the current folder\n- it printed the names of the items inside it\n\nNow compare that with:\n\n```bash\npwd\n```\n\nPossible output:\n\n```bash\n/home/learner/project\n```\n\nThis tells you **where you are**, not **what is inside**. That difference matters:\n\n- `pwd` answers: “What folder am I in?”\n- `ls` answers: “What is in this folder?”\n\nIf you are organizing a newsletter workspace, `pwd` helps you confirm you are in the `drafts` folder, while `ls` helps you see whether files like `intro.txt` or `outline.txt` are there."
          },
          "why-terminal-matters": {
            "title": "Pourquoi les gens utilisent-ils le terminal ?",
            "bodyMarkdown": "People use the terminal because it gives clear, direct control over files and folders. It is especially useful when you want to inspect a workspace quickly or repeat the same kinds of actions.\n\nFor a beginner, the most important idea is this: the terminal helps you **navigate** and **inspect** your workspace with commands.\n\nHere is a short sequence:\n\n```bash\npwd\nls\n```\n\nStep by step:\n\n- `pwd` shows your current folder\n- `ls` shows what is inside that folder\n\nTogether, these commands help you stay oriented.\n\nImagine you are a junior assistant preparing folders for an event team. You might need to confirm that you are inside `event-plan` before checking whether `schedule.txt` and `guests.txt` exist. In the terminal, that workflow is quick and precise.\n\nThe terminal does not replace thinking. You still decide what you want to inspect or change. The terminal is simply the tool that carries out your commands and reports back."
          }
        }
      }
    },
    "py": {
      "syntax": {
        "comments": {
          "title": "Commentaires : des notes pour les humains (Python les ignore)",
          "bodyMarkdown": "Quand tu écris du code, tu écris pour **deux publics** :\n\n1) L’ordinateur (Python)\n2) Ton futur toi (et les autres humains)\n\nUn **commentaire** est une note pour les humains que Python ignore complètement.\n\nPense aux commentaires comme à des post-its sur une recette :\nils t’aident à te rappeler *pourquoi* tu as fait quelque chose, pas seulement *quoi*.\n\n---\n\n## Deux façons d’écrire des commentaires en Python\n\nEn Python, tu utiliseras surtout :\n\n1) Les **commentaires sur une ligne** avec `#`\n2) Les **notes multi-lignes** (plusieurs lignes commençant par `#`, ou parfois des triples guillemets)\n\n---\n\n## Commentaire sur une ligne : `#`\n\nTout ce qui suit `#` sur une ligne est ignoré par Python.\n\n~~~python\n# Ceci est un commentaire.\nprint(\"Hello\")  # Ceci aussi est un commentaire\n~~~\n\n---\n\n## Commentaires multi-lignes (notes multi-lignes)\n\nPour écrire des notes sur plusieurs lignes, tu as deux options courantes :\n\n### Option A : plusieurs lignes `#` (recommandé)\n\n~~~python\n# Étape 1 : demander une entrée à l’utilisateur\n# Étape 2 : convertir en nombre\n# Étape 3 : faire le calcul\n# Étape 4 : afficher le résultat\n~~~\n\n### Option B : triples guillemets (`\"\"\" ... \"\"\"` ou `''' ... '''`)\n\nCela crée une **chaîne multi-ligne**. Si elle n’est pas assignée à une variable, Python l’ignore généralement à l’exécution, donc certains l’utilisent comme un commentaire de bloc.\n\n~~~python\n\"\"\"\nNote multi-ligne :\n- Ceci est un littéral de chaîne\n- Certains l’utilisent comme « commentaire de bloc »\n\"\"\"\n~~~\n\n> **Astuce :** Utilise les triples guillemets surtout pour les **docstrings** (documentation des fonctions/classes). Pour les commentaires « normaux », préfère les lignes `#`.\n\n---\n\n## Pourquoi les commentaires comptent (Module 0)\n\nUtilise les commentaires pour :\n- expliquer *pourquoi* une ligne existe\n- nommer les étapes d’un mini-programme (demander → convertir → calculer → afficher)\n- désactiver temporairement une ligne pendant le debug\n\n---\n\n## Essaie (éditeur à droite)\n\nExécute ceci :\n\n~~~python\n# Étape 1 : stocker des valeurs dans des variables\nprice = 4.99\nqty = 3\n\n# Étape 2 : calculer\ntotal = price * qty\n\n# Étape 3 : afficher\nprint(\"total =\", total)\n~~~\n\nMaintenant **commente** la ligne qui calcule `total` et relance :\n\n~~~python\nprice = 4.99\nqty = 3\n\n# total = price * qty\n\nprint(\"total =\", total)\n~~~\n\nTu devrais obtenir une erreur — c’est normal.\nÇa prouve que les commentaires « retirent » vraiment du code de l’exécution.\n\n---\n\n## Notes\n\n✅ Écris des commentaires pour expliquer **l’intention** (le *pourquoi*).\n❌ N’écris pas des commentaires qui ne font que répéter le code.\n\nCommentaire utile :\n~~~python\n# Convertir l’entrée (texte) en nombre pour pouvoir faire des calculs\nage = int(input(\"Age: \"))\n~~~\n\nPas utile (répète le code) :\n~~~python\n# Mettre age à l’entrée\nage = int(input(\"Age: \"))\n~~~\n\n---\n\nEnsuite : on utilisera les commentaires pour nommer nos étapes en apprenant les **variables** et les **types de données**."
        }
      },
      "types": {
        "basic": {
          "title": "Data Types: What’s Inside the Box?",
          "bodyMarkdown": "You already have labeled boxes (variables). Now the next question is:\n\n**What kind of thing is inside the box?**\n\nPython calls that a **data type**.\n\nA type tells Python what the value *is*, and what you’re allowed to do with it.\n\n---\n\n## 5 types you’ll use constantly\n\n(There are more than five, but these show up everywhere.)\n\n### 1) Integers (`int`) — whole numbers\n~~~python\nstudents = 28\n~~~\n\n### 2) Floats (`float`) — decimals\n~~~python\nprice = 3.75\n~~~\n\n### 3) Strings (`str`) — text\n~~~python\nmessage = \"Welcome!\"\n~~~\n\n### 4) Booleans (`bool`) — True/False\n~~~python\nis_logged_in = True\n~~~\n\n### 5) None (`NoneType`) — “empty on purpose”\n~~~python\nnickname = None\n~~~\n\n`None` means:\n> “There is no value here yet.”\n\n---\n\n## Try it (scan the boxes)\n\nPaste this code into the editor on the **right** and run it:\n\n~~~python\nstudents = 28\nprice = 3.75\nmessage = \"Welcome!\"\nis_logged_in = True\nnickname = None\n\nprint(\"students:\", students, \"| type:\", type(students))\nprint(\"price:\", price, \"| type:\", type(price))\nprint(\"message:\", message, \"| type:\", type(message))\nprint(\"is_logged_in:\", is_logged_in, \"| type:\", type(is_logged_in))\nprint(\"nickname:\", nickname, \"| type:\", type(nickname))\n~~~\n\n---\n\n## Why types matter\n\nTypes affect how operations behave:\n\n- numbers add like math\n- strings “add” by joining text (**concatenation**)\n- mixing incompatible types can cause errors\n\nNumbers add like math:\n\n~~~python\na = 10\nb = 5\nprint(a + b)  # 15\n~~~\n\nStrings join together:\n\n~~~python\na = \"10\"\nb = \"5\"\nprint(a + b)  # \"105\"\n~~~\n\nThat’s not math — it’s **string concatenation** (joining text with `+`).\n\n---\n\n## Try it (predict first)\n\nBefore you run this, guess the output:\n\n~~~python\nprint(10 + 5)\nprint(\"10\" + \"5\")\nprint(\"hi\" + \" there\")\n~~~\n\nThen run it and check your guesses."
        },
        "convert": {
          "title": "Type Conversion: Turning Strings into Numbers",
          "bodyMarkdown": "Here’s a classic beginner surprise.\n\n---\n\n## Heads-up: `input(...)` always returns text\n\n`input(\"...\")` asks the user a question, and the user types an answer.\n\nOne rule matters most:\n\n✅ **`input()` always returns a string (`str`).**\n\n---\n\n## Try it (see the type)\n\nRun this and type anything when prompted:\n\n~~~python\nage = input(\"Enter your age: \")\nprint(\"You typed:\", age)\nprint(\"type:\", type(age))\n~~~\n\nNo matter what you type, the type is still `str`.\n\n---\n\n## Convert the type (casting)\n\nIf you want Python to treat input as a number, you must convert it:\n\n- use `int(...)` for whole numbers\n- use `float(...)` for decimals\n\n### Convert to int (whole number)\n~~~python\nage = int(input(\"Enter your age: \"))\nprint(age + 1)\n~~~\n\n### Convert to float (decimal)\n~~~python\nprice = float(input(\"Enter price: \"))\nprint(price * 1.10)\n~~~\n\n### Convert to string (when you need text)\n~~~python\nscore = 95\nmsg = \"Your score is \" + str(score)\nprint(msg)\n~~~\n\n---\n\n## Try it (mini checkout)\n\n~~~python\nprice = float(input(\"Price: \"))\nqty = int(input(\"Quantity: \"))\ntotal = price * qty\nprint(\"Total =\", total)\n~~~\n\nRun it again with different numbers."
        },
        "errors": {
          "title": "Common Errors: NameError, TypeError, and Debug Tricks",
          "bodyMarkdown": "Mistakes are a normal part of programming.\n\nWhen Python raises an error, it’s giving you **information about what went wrong**.\nLearning to read errors is one of the fastest ways to improve.\n\nHere are three common ones beginners encounter.\n\n---\n\n## 1) NameError — using a variable that doesn’t exist\n\n~~~python\nprint(score)\n~~~\n\nIf the variable `score` was never created, Python cannot use it.\n\nCommon causes:\n- a typo: `scroe` instead of `score`\n- using a variable before assigning a value\n\n---\n\n## Try it\n\nRun this (it works):\n\n~~~python\nscore = 10\nprint(score)\n~~~\n\nNow delete the line:\n\n~~~python\nscore = 10\n~~~\n\nRun the code again.\nYou should see a **NameError** because the variable no longer exists.\n\n---\n\n## 2) TypeError — incompatible types\n\nSometimes values exist, but they **cannot be combined the way you tried**.\n\n~~~python\nage = input(\"Age: \")   # string\nprint(age + 1)         # 🚫 string + int\n~~~\n\nThe variable `age` contains **text**, not a number.\n\nFix it by converting the type:\n\n~~~python\nage = int(input(\"Age: \"))\nprint(age + 1)\n~~~\n\n---\n\n## 3) ValueError — invalid value for a conversion\n\n~~~python\nage = int(\"twelve\")  # 🚫 ValueError\n~~~\n\nPython is trying to convert text into a number, but the text **does not represent a valid number**.\n\nValid examples:\n\n~~~python\nint(\"12\")\nfloat(\"3.5\")\n~~~\n\nInvalid examples:\n\n~~~python\nint(\"twelve\")\nfloat(\"hello\")\n~~~\n\n---\n\n## A simple debugging technique\n\nWhen something looks wrong, inspect the value and its type.\n\n### Print the value\n~~~python\nprint(\"value:\", x)\n~~~\n\n### Print the type\n~~~python\nprint(\"type:\", type(x))\n~~~\n\nThis quickly reveals many beginner mistakes.\n\n---\n\n## Quick mental model\n\n- **NameError** → the variable doesn't exist\n- **TypeError** → the types don’t work together\n- **ValueError** → the value is not in the expected format\n\nLearning to interpret these messages will save you a lot of time while programming."
        }
      },
      "io": {
        "patterns": {
          "title": "Schémas d’entrée + sortie : des réponses aux vrais mini-programmes",
          "bodyMarkdown": "Jusqu’ici, tu as appris les briques de base de Python :\n\n- Les **variables** stockent des valeurs.\n- Les **types** décrivent ce que sont ces valeurs.\n- Les **opérateurs + expressions** calculent de nouveaux résultats.\n- Les **chaînes de caractères** représentent du texte (et `input()` renvoie des chaînes).\n\nMaintenant, nous allons combiner tout cela dans la structure de base d’un programme.\n\nLa plupart des programmes pour débutants suivent la même boucle :\n\n### Demander → Convertir → Calculer → Afficher\n\n1. **Demander** une information à l’utilisateur\n2. **Convertir** cette information dans le bon type\n3. **Calculer** quelque chose avec elle\n4. **Afficher** le résultat\n\nUne fois que tu comprends ce schéma, tu peux construire beaucoup de petits programmes.\n\n---\n\n## L’outil « Demander » : `input()`\n\n`input()` met le programme en pause et attend que l’utilisateur saisisse quelque chose.\n\nExemple :\n\n~~~python\nname = input(\"Quel est ton nom ? \")\nprint(\"Bonjour\", name)\n~~~\n\nMais il y a une règle importante :\n\n> ✅ **`input()` renvoie toujours une chaîne de caractères (`str`).**\n\nMême si l’utilisateur tape un nombre.\n\n---\n\n## Essaie-le (pour le vérifier)\n\nLance ceci et tape quelque chose comme `25`.\n\n~~~python\nx = input(\"Tape quelque chose : \")\n\nprint(\"Tu as tapé :\", x)\nprint(\"type :\", type(x))\n~~~\n\nMême quand tu tapes un nombre, Python le stocke toujours comme du **texte**.\n\n---\n\n## L’étape « Convertir » : le cast\n\nSi tu veux faire des calculs, tu dois convertir le texte en nombre.\n\nConversions courantes :\n\n- `int(...)` → nombres entiers\n- `float(...)` → nombres décimaux\n\nExemple :\n\n~~~python\nage = int(input(\"Âge : \"))\nprint(\"L’année prochaine :\", age + 1)\n~~~\n\nMaintenant, Python peut faire de l’arithmétique.\n\n---\n\n## Essaie-le\n\n~~~python\nage = int(input(\"Âge : \"))\nprint(f\"L’année prochaine tu auras {age + 1} ans.\")\n~~~\n\nLance-le deux fois avec des nombres différents.\n\n---\n\n## Petit avertissement : les conversions peuvent échouer\n\nSi l’utilisateur tape quelque chose qui **n’est pas un nombre**, la conversion échoue.\n\n~~~python\nage = int(\"hello\")  # 🚫 ValueError\n~~~\n\nPython dit en substance :\n\n> « J’ai essayé de convertir ce texte en nombre, mais ce n’est pas valide. »\n\nPour l’instant, il suffit de comprendre **pourquoi cette erreur arrive**.\nPlus tard, tu apprendras à gérer cela correctement.\n\n---\n\n## L’étape « Afficher » : une sortie claire\n\nTu as déjà vu les **f-strings** dans la leçon sur les chaînes de caractères.\n\nC’est la façon la plus propre d’afficher un résultat.\n\n~~~python\nname = \"Maya\"\nage = 16\n\nprint(f\"Bonjour {name}, tu as {age} ans.\")\n~~~\n\nLes f-strings combinent naturellement **texte + variables**.\n\n---\n\n## Schéma 1 : Demander → Convertir → Calculer → Afficher\n\nMettons tout le schéma ensemble.\n\n~~~python\nvalue = float(input(\"Entre un nombre : \"))\nresult = value * 2\n\nprint(f\"Le double est {result}\")\n~~~\n\nLe programme fait quatre choses :\n\n1️⃣ Demander une entrée\n2️⃣ La convertir en nombre\n3️⃣ Calculer un résultat\n4️⃣ Afficher le résultat\n\n---\n\n## Essaie de modifier le calcul\n\nChange le calcul et relance.\n\n~~~python\nvalue = float(input(\"Entre un nombre : \"))\n\nprint(\"plus dix :\", value + 10)\nprint(\"fois trois :\", value * 3)\nprint(\"moitié :\", value / 2)\n~~~\n\nRemarque qu’une même entrée peut produire des résultats différents.\n\n---\n\n## Une petite calculatrice\n\nVoici un vrai petit programme qui utilise le même schéma.\n\n~~~python\na = float(input(\"Premier nombre : \"))\nb = float(input(\"Deuxième nombre : \"))\n\nsum_result = a + b\nprint(f\"La somme est {sum_result}\")\n~~~\n\nTu viens de construire une **calculatrice à deux nombres**.\n\n---\n\n## L’idée clé\n\nBeaucoup de programmes pour débutants suivent la même structure :\n\n**Entrée → Traitement → Sortie**\n\nou, plus concrètement :\n\n**Demander → Convertir → Calculer → Afficher**\n\nUne fois que ce schéma devient naturel, programmer devient beaucoup plus simple.\n\n---\n\n## Ce qui vient ensuite\n\nPour l’instant, tes programmes exécutent toujours les mêmes instructions.\n\nEnsuite, nous allons débloquer les **conditions**, pour que ton programme puisse décider :\n\n> *« Si ceci arrive… fais cela à la place. »*"
        }
      },
      "ops": {
        "expressions": {
          "title": "Operators + Expressions: The Calculator Inside Your Code",
          "bodyMarkdown": "You already learned two important ideas:\n\n- **Variables** are labeled boxes that store values.\n- **Data types** tell you what kind of value is inside those boxes.\n\nNow we unlock the next capability:\n\n✅ **Using those values to compute new ones.**\n\nThink of your program like a small kitchen.\n\n- Variables are your **ingredients** (flour, sugar, milk).\n- Operators are your **tools** (mix, cut, heat).\n- Expressions are the **recipe steps** that combine everything.\n\nWhen you write an expression, you are telling Python:\n\n> “Take these values, apply an operation, and give me the result.”\n\n---\n\n## What is an operator?\n\nAn **operator** is a symbol that performs an operation.\n\nExamples:\n\n- `+` adds numbers\n- `*` multiplies numbers\n- `==` compares two values\n\nOperators take values and produce a result.\n\n---\n\n## What is an expression?\n\nAn **expression** is a piece of code that **evaluates to a value**.\n\nExamples:\n\n~~~python\n2 + 3\nprice * tax\nage >= 18\n~~~\n\nEach expression produces a result that Python can use.\n\n---\n\n## The basic math operators\n\nThese are the core arithmetic operators in Python:\n\n- `+` addition\n- `-` subtraction\n- `*` multiplication\n- `/` division (result is a float)\n- `//` floor division\n- `%` modulo (remainder)\n- `**` exponent (power)\n\n---\n\n## Try it\n\nCopy this into the editor on the right and run it:\n\n~~~python\nprint(\"2 + 3 =\", 2 + 3)\nprint(\"10 - 4 =\", 10 - 4)\nprint(\"6 * 7 =\", 6 * 7)\nprint(\"8 / 2 =\", 8 / 2)\nprint(\"7 / 2 =\", 7 / 2)\n~~~\n\nNotice that division with `/` can produce decimals.\n\n---\n\n## Floor division\n\nFloor division `//` means:\n\n> Divide, then keep only the whole-number part.\n\n~~~python\nprint(\"7 // 2 =\", 7 // 2)\nprint(\"9 // 4 =\", 9 // 4)\n~~~\n\n### Try it\n\n~~~python\nprint(\"15 // 2 =\", 15 // 2)\nprint(\"15 / 2  =\", 15 / 2)\n~~~\n\nCompare the results.\n\n---\n\n## Modulo: the remainder operator\n\nModulo `%` returns the remainder after division.\n\n~~~python\nprint(\"7 % 2 =\", 7 % 2)\nprint(\"10 % 3 =\", 10 % 3)\n~~~\n\n### Why modulo is useful\n\nModulo is commonly used to:\n\n- check **even vs odd numbers**\n- cycle through values\n- group items into batches\n\nExample:\n\n~~~python\nn = 14\nprint(\"n % 2 =\", n % 2)  # 0 means even\n\nn = 15\nprint(\"n % 2 =\", n % 2)  # 1 means odd\n~~~\n\n---\n\n## Exponents\n\nThe exponent operator `**` raises a number to a power.\n\n~~~python\nprint(\"2 ** 3 =\", 2 ** 3)\nprint(\"5 ** 2 =\", 5 ** 2)\n~~~\n\nTry changing the numbers and run again.\n\n---\n\n## Using variables in expressions\n\nThis is where the kitchen metaphor becomes useful.\n\nVariables hold the **ingredients**, and expressions combine them.\n\n~~~python\nprice = 4.99\nqty = 3\nsubtotal = price * qty\n\nprint(\"subtotal =\", subtotal)\n~~~\n\n### Try it\n\nChange `price` and `qty` and run the program again.\n\nThe **same expression** produces a different result because the ingredients changed.\n\n---\n\n## Comparison operators\n\nSometimes you don’t want a number result.\nYou want to **check a condition**.\n\nComparison operators produce a **boolean value**:\n\n- `==` equal to\n- `!=` not equal to\n- `<` less than\n- `<=` less than or equal\n- `>` greater than\n- `>=` greater than or equal\n\nExample:\n\n~~~python\nage = 16\nprint(age >= 18)\n~~~\n\nThe result is either `True` or `False`.\n\n---\n\n## Try it (predict first)\n\nBefore running, guess what each line prints:\n\n~~~python\nprint(5 == 5)\nprint(5 != 5)\nprint(10 > 3)\nprint(10 < 3)\nprint(7 >= 7)\nprint(7 <= 6)\n~~~\n\nRun it and check your guesses.\n\n---\n\n## A common beginner mistake: = vs ==\n\n- `=` **assignment** (store a value in a variable)\n- `==` **comparison** (check if two values match)\n\n~~~python\nx = 5\nprint(x == 5)\n~~~\n\n---\n\n## Expressions depend on types\n\nOperators behave differently depending on the data type.\n\n~~~python\nprint(10 + 5)\nprint(\"10\" + \"5\")\n~~~\n\nThe first line adds numbers.\nThe second joins text.\n\nIf you're unsure about a value's type, inspect it:\n\n~~~python\nx = \"10\"\nprint(type(x))\n~~~\n\n---\n\n## Mini exercise: simple checkout\n\n~~~python\nprice = 2.50\nqty = 4\ntax_rate = 0.10\n\nsubtotal = price * qty\ntax = subtotal * tax_rate\ntotal = subtotal + tax\n\nprint(\"subtotal =\", subtotal)\nprint(\"tax =\", tax)\nprint(\"total =\", total)\n~~~\n\nTry changing `qty` and `tax_rate` and run it again.\n\n---\n\n## What you unlocked\n\nOperators and expressions allow programs to:\n\n1) **Compute results**\n2) **Evaluate conditions**\n\nNext, we’ll improve how programs work with **strings** and produce cleaner output."
        }
      },
      "strings": {
        "basics": {
          "title": "String Basics: Working With Text Like a Pro",
          "bodyMarkdown": "You already learned how Python stores and uses values:\n\n- **Variables** are labeled boxes.\n- **Data types** tell you what kind of value is inside the box.\n- **Operators + expressions** let you compute results.\n\nNow we meet a type you’ll use constantly:\n\n✅ **Strings** (`str`) — text.\n\nStrings store things like:\n\n- names\n- messages\n- emails\n- passwords\n- search terms\n- anything the user types using `input()`\n\nIn fact, remember this rule:\n\n> ✅ `input()` always returns a **string**.\n\nSo understanding strings means understanding how your program reads and displays text.\n\n---\n\n## What is a string?\n\nA string is simply **text inside quotes**.\n\n~~~python\nname = \"Maya\"\ncity = 'Chicago'\n~~~\n\nSingle quotes and double quotes both work.\nJust pick one style and stay consistent.\n\n---\n\n## Showing text with print()\n\nWe’ve been using `print(...)` to show results in the terminal.\n\nNow we’ll use it to display text and variables together.\n\n---\n\n## Concatenation vs commas in print()\n\n### Concatenation (string + string)\n\nConcatenation means **joining strings together** using `+`.\n\n~~~python\nfirst = \"Maya\"\nlast = \"Johnson\"\n\nfull = first + \" \" + last\nprint(full)\n~~~\n\nThis works well, but there’s one rule:\n\n✅ Both sides of `+` must be **strings**.\n\nIf you try to join text and numbers directly, Python raises an error.\n\n~~~python\nage = 16\nprint(\"age: \" + age)  # 🚫 TypeError\n~~~\n\nFix it by converting the number to a string:\n\n~~~python\nage = 16\nprint(\"age: \" + str(age))\n~~~\n\n---\n\n### Commas in print (simpler)\n\nWhen you use commas inside `print`, Python prints each value separated by a space.\n\n~~~python\nage = 16\nprint(\"age:\", age)\n~~~\n\nThis is often the easiest way to display mixed values.\n\n---\n\n## Try it\n\n~~~python\nname = \"Maya\"\nage = 16\n\nprint(\"Hello \" + name)\nprint(\"Hello\", name)\n\nprint(\"age: \" + str(age))\nprint(\"age:\", age)\n~~~\n\nRun it and compare the outputs.\n\n---\n\n## f-strings: the cleanest way to mix text and variables\n\nModern Python usually uses **f-strings**.\n\nThey allow you to insert variables directly inside text.\n\n~~~python\nname = \"Maya\"\nage = 16\n\nprint(f\"Hi {name}, you are {age} years old.\")\n~~~\n\nIt reads almost like a normal sentence.\n\n---\n\n## Try it\n\n~~~python\nname = \"YourNameHere\"\ncity = \"YourCityHere\"\n\nprint(f\"Hi {name}! Welcome to {city}.\")\n~~~\n\nChange the values and run it again.\n\n---\n\n## Indexing: strings are sequences of characters\n\nA string is like a row of characters.\n\nEach character has a position called an **index**.\n\nIndexes start at **0**:\n\n~~~python\nword = \"Python\"\n\nprint(word[0])  # P\nprint(word[1])  # y\n~~~\n\nPython also supports negative indexes.\n\n`-1` means **the last character**:\n\n~~~python\nword = \"Python\"\n\nprint(word[-1])  # n\nprint(word[-2])  # o\n~~~\n\n---\n\n## Try it\n\n~~~python\nword = \"Learnoir\"\n\nprint(\"first:\", word[0])\nprint(\"second:\", word[1])\nprint(\"last:\", word[-1])\nprint(\"second last:\", word[-2])\n~~~\n\nNow change `word` to your own name and run it again.\n\n---\n\n## Slicing: taking a piece of a string\n\nSlicing lets you extract part of a string.\n\nFormat: `text[start:end]`\n\n- includes `start`\n- stops before `end`\n\n~~~python\nword = \"Python\"\n\nprint(word[0:2])  # Py\nprint(word[2:6])  # thon\n~~~\n\nShortcuts:\n\n~~~python\nword = \"Python\"\n\nprint(word[:2])  # Py\nprint(word[2:])  # thon\n~~~\n\n---\n\n## Try it\n\n~~~python\nword = \"Programming\"\n\nprint(word[:4])\nprint(word[4:])\nprint(word[1:6])\n~~~\n\n---\n\n## Common string methods\n\nMethods are built-in tools attached to strings.\n\nThink of them as **small text utilities**.\n\n### lower() — convert to lowercase\n\n~~~python\nmsg = \"HeLLo!\"\nprint(msg.lower())\n~~~\n\n### strip() — remove extra spaces\n\n~~~python\nraw = \"   hello   \"\nprint(raw.strip())\n~~~\n\n### replace() — substitute text\n\n~~~python\ntext = \"I like cats\"\nprint(text.replace(\"cats\", \"dogs\"))\n~~~\n\n---\n\n## Try it: clean user input\n\nUser input is often messy.\n\n~~~python\nname = input(\"Enter your name: \")\n\nclean = name.strip().lower()\n\nprint(\"raw:\", name)\nprint(\"clean:\", clean)\nprint(f\"Hello, {clean}!\")\n~~~\n\nTry typing:\n\n`   MAya   `\n\nNotice how the cleaned version changes.\n\n---\n\n## Mini exercise: simple username generator\n\n~~~python\nfirst = input(\"First name: \").strip()\nlast = input(\"Last name: \").strip()\n\nusername = (first[0] + last).lower()\n\nprint(f\"username: {username}\")\n~~~\n\nYou just used:\n\n- variables\n- strings\n- indexing\n- methods\n- f-strings\n- terminal output\n\n---\n\n## What you unlocked\n\nStrings are how programs **communicate**.\n\nNow you can:\n\n- display messages clearly\n- combine text with variables\n- access characters inside text\n- extract pieces of a string\n- clean user input\n\nNext, we’ll combine **strings + numbers + input** to build small interactive programs."
        }
      },
      "vars": {
        "boxes": {
          "title": "Variables: Labeled Boxes for Your Data",
          "bodyMarkdown": "Imagine your computer's memory as a **huge storage room**.\n\nInside that room, the computer keeps many pieces of information:\n\n- numbers\n- text\n- results of calculations\n\nBut if everything were thrown into the room without organization, it would be impossible to find anything.\n\nSo we use **labeled boxes**.\n\nEach box holds a piece of data, and the **label tells us what’s inside**.\n\nFor example, you might have boxes labeled:\n\n- **snacks**\n- **homework**\n- **cables**\n- **important_stuff**\n\nNow, instead of searching the whole room, you can just look for the **label**.\n\nIn Python, a **variable** is exactly that label.\n\n✅ A variable is a **name that refers to a value stored in memory**.\n\n---\n\n## The “show it on the terminal screen” tool\n\nYou’ll see `print(...)` used a lot, and you might be wondering what it does.\n\nFor now, think of `print(...)` as a **display tool**.\n\n> Whatever you put inside `print(...)` will appear in the **terminal output** when the program runs.\n\nWe’ll talk more about these **tools with parentheses** (called functions) later.\n\n---\n\n## The moment a variable is created\n\nIn Python, a variable is created the moment you assign a value to it.\n\n~~~python\nage = 16\nname = \"Maya\"\n~~~\n\nRead this like a story:\n\n- Put **16** in a box labeled **age**\n- Put **\"Maya\"** in a box labeled **name**\n\nPython uses the symbol `=` for **assignment**.\n\nIn mathematics, `=` means **is equal to**.\nIn programming, it means:\n\n> “Store this value inside this variable.”\n\n*(When we want to compare values later, we use `==`. We'll learn that soon.)*\n\n---\n\n## Try it (editor on the right)\n\nCopy this code into the editor on the **right**, then run it and watch the terminal output:\n\n~~~python\nage = 16\nname = \"Maya\"\n\nprint(\"age =\", age)\nprint(\"name =\", name)\n~~~\n\nNow change the values (try a different name and age) and run it again.\n\n---\n\n## Variables can change (that’s the whole point)\n\nVariables are useful because the value inside the box can **change**.\n\n~~~python\nscore = 10\nscore = score + 5\nprint(score)  # 15\n~~~\n\nThat second line means:\n\n> Take the value inside **score**, add 5, and store the new result back into **score**.\n\nThe label stays the same — but the **value inside the box changes**.\n\n---\n\n## Try it (watch the change)\n\n~~~python\nscore = 10\nprint(\"start:\", score)\n\nscore = score + 5\nprint(\"after +5:\", score)\n\nscore = score - 2\nprint(\"after -2:\", score)\n~~~\n\nChange the `+5` and `-2` to other numbers and run the code again.\n\nWatch how the value keeps updating.\n\n---\n\n## Variable names (label rules)\n\nBecause variables are **labels**, they must follow some rules.\n\n✅ Allowed:\n- letters\n- numbers\n- underscores\n\n❗ But they **cannot start with a number**.\n\n❌ Not allowed:\n- spaces\n- symbols like `$` or `@`\n- Python keywords like `class`, `for`, `if`\n\nExamples:\n\n~~~python\nstudent_name = \"Ayo\"   # good (snake_case is common in Python)\nstudentName = \"Ayo\"    # also valid\n2cool = \"nope\"         # invalid (starts with a number)\n~~~\n\n---\n\n## Quick mental model\n\nA variable is **not the value itself**.\n\nIt is a **name tag** that lets you reuse and organize your data.\n\n~~~python\nprice = 4.99\ntax = 0.10\ntotal = price + (price * tax)\n\nprint(total)\n~~~\n\nWithout variables, you would repeat numbers everywhere.\n\nWith variables, your programs become:\n\n- easier to read\n- easier to change\n- easier to understand"
        }
      }
    },
    "sql": {
      "sql_module_5": {
        "adding-and-subtracting": {
          "sketch-1": {
            "title": "Qu'est-ce qu'une colonne calculée ?",
            "bodyMarkdown": "Une colonne calculée en SQL est une valeur que vous créez à la volée dans votre instruction SELECT à l'aide d'opérations arithmétiques ou d'expressions. Par exemple, vous pouvez multiplier les colonnes `quantity` et `unit_price` pour obtenir un total pour chaque commande :\n\n```sql\nSELECT id, customer_name, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nCette requête ajoute une nouvelle colonne appelée `line_total` qui n'est pas stockée dans la table, mais calculée pour chaque ligne."
          },
          "sketch-2": {
            "title": "Addition et soustraction dans SELECT",
            "bodyMarkdown": "Vous pouvez utiliser `+` pour additionner et `-` pour soustraire des colonnes ou des valeurs en SQL. Par exemple, pour accorder une remise de 5 $ sur chaque commande, soustrayez 5 du total calculé :\n\n```sql\nSELECT id, customer_name, quantity, unit_price, (quantity * unit_price) - 5 AS discounted_total\nFROM orders;\n```\n\nVous pouvez aussi ajouter des frais fixes, comme 2 $ de frais de port :\n\n```sql\nSELECT id, customer_name, (quantity * unit_price) + 2 AS total_with_shipping\nFROM orders;\n```"
          },
          "sketch-3": {
            "title": "Utiliser des alias pour plus de clarté",
            "bodyMarkdown": "Lorsque vous créez une colonne calculée, utilisez `AS` pour lui donner un nom clair (alias). Cela rend vos résultats plus lisibles et compréhensibles. Par exemple :\n\n```sql\nSELECT id, customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nIci, `line_total` est l'alias pour la valeur calculée."
          }
        },
        "as": {
          "sk1": {
            "title": "Qu'est-ce que AS en SQL ?",
            "bodyMarkdown": "En SQL, le mot-clé `AS` est utilisé pour attribuer un alias à une colonne ou une table. Ceci est particulièrement utile lorsque vous souhaitez renommer une colonne dans votre jeu de résultats, afin de le rendre plus lisible ou plus significatif. Par exemple, si vous calculez une valeur dans votre instruction SELECT, vous pouvez utiliser `AS` pour donner à cette colonne calculée un nom explicite.\n\nExemple :\n```sql\nSELECT quantity * unit_price AS line_total\nFROM orders;\n```\nCette requête calcule le total pour chaque ligne de commande et nomme le résultat `line_total` au lieu de l'expression par défaut."
          },
          "sk2": {
            "title": "Pourquoi utiliser des alias de colonnes ?",
            "bodyMarkdown": "Les alias de colonnes rendent les résultats de vos requêtes SQL plus lisibles et prêts à être présentés. Sans alias, les colonnes calculées ou les résultats de fonctions peuvent avoir des noms peu clairs ou complexes. Utiliser `AS` aide à clarifier la signification de chaque colonne dans votre sortie.\n\nExemple :\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\nIci, `total_amount` est bien plus explicite que de simplement voir le calcul."
          },
          "sk3": {
            "title": "Alias avec fonctions et expressions",
            "bodyMarkdown": "Vous pouvez utiliser `AS` avec n'importe quelle expression ou fonction dans votre instruction SELECT. Cela inclut les opérations arithmétiques, les opérations sur les chaînes ou les fonctions intégrées.\n\nExemple :\n```sql\nSELECT customer_name, UPPER(region) AS region_upper\nFROM orders;\n```\nCette requête affiche le nom de chaque client et sa région en majuscules, sous le nom `region_upper`."
          }
        },
        "date-function-awareness": {
          "sk1": {
            "title": "Quelles sont les fonctions de date en SQL ?",
            "bodyMarkdown": "Les fonctions de date en SQL vous permettent de manipuler et d'extraire des informations à partir de valeurs de date. Par exemple, vous pouvez extraire l'année, le mois ou le jour d'une date, ou calculer la différence entre deux dates. Dans SQLite, les fonctions de date courantes incluent `date()`, `strftime()` et `datetime()`. Elles sont utiles pour filtrer, regrouper ou créer de nouvelles colonnes à partir d'informations de date.\n\n**Exemple :**\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nCette requête extrait l'année de chaque `order_date` dans la table `orders`."
          },
          "sk2": {
            "title": "Utiliser les fonctions de date dans les colonnes calculées",
            "bodyMarkdown": "Vous pouvez utiliser les fonctions de date directement dans vos instructions SELECT pour créer des colonnes calculées. Par exemple, si vous voulez voir dans quel mois chaque commande a été passée, vous pouvez utiliser :\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nCela ajoutera une nouvelle colonne appelée `order_month` affichant la partie mois de la date de chaque commande."
          },
          "sk3": {
            "title": "Filtrer avec des fonctions de date",
            "bodyMarkdown": "Les fonctions de date sont également utiles pour filtrer les données. Par exemple, pour trouver toutes les commandes passées en janvier, vous pouvez utiliser :\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nCela filtre la table `orders` pour n'inclure que les lignes où le mois est janvier."
          }
        },
        "discount-calculations": {
          "sk1": {
            "title": "Que sont les calculs de remise en SQL ?",
            "bodyMarkdown": "Les calculs de remise en SQL consistent à utiliser des expressions arithmétiques pour calculer de nouvelles valeurs à partir de colonnes existantes. Par exemple, vous pouvez calculer un prix remisé en multipliant le prix d'origine par un taux de remise. Ces calculs sont souvent effectués dans la clause `SELECT` et peuvent recevoir des noms lisibles grâce aux alias.\n\nExemple :\n\n```sql\nSELECT id, customer_name, unit_price, unit_price * 0.9 AS discounted_price\nFROM orders;\n```\n\nCette requête affiche le prix d'origine de chaque commande et le prix après une remise de 10 %."
          },
          "sk2": {
            "title": "Utiliser plusieurs colonnes dans des expressions",
            "bodyMarkdown": "Vous pouvez combiner des colonnes dans des expressions SQL pour calculer des valeurs comme les totaux de ligne ou appliquer des remises aux totaux. Par exemple, pour obtenir le prix total de chaque ligne de commande après une remise de 15 % :\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total,\n       quantity * unit_price * 0.85 AS discounted_total\nFROM orders;\n```\n\nCela multiplie la quantité par le prix unitaire pour le total d'origine, puis applique une remise de 15 %."
          }
        },
        "intro-to-functions": {
          "sk1": {
            "title": "Qu'est-ce qu'une fonction SQL ?",
            "bodyMarkdown": "Une fonction SQL est une opération intégrée qui prend une ou plusieurs valeurs en entrée et retourne une seule valeur en sortie. Les fonctions peuvent être utilisées dans les instructions SELECT pour transformer ou résumer des données. Par exemple, vous pouvez utiliser `UPPER(customer_name)` pour convertir tous les noms de clients en majuscules, ou `ROUND(unit_price, 0)` pour arrondir les prix à l'entier le plus proche."
          },
          "sk2": {
            "title": "Utiliser des fonctions dans SELECT",
            "bodyMarkdown": "Vous pouvez utiliser des fonctions directement dans votre clause SELECT. Par exemple, pour afficher l'identifiant de la commande et le nom du client en majuscules depuis la table `orders` :\n\n```sql\nSELECT id, UPPER(customer_name) AS customer_upper FROM orders;\n```\nCette requête retourne l'identifiant de chaque commande et le nom du client en lettres majuscules."
          },
          "sk3": {
            "title": "Combiner des fonctions avec des expressions",
            "bodyMarkdown": "Les fonctions peuvent être combinées avec des expressions arithmétiques. Par exemple, pour calculer le prix total de chaque commande et l'arrondir à l'entier le plus proche :\n\n```sql\nSELECT id, ROUND(quantity * unit_price, 0) AS rounded_total FROM orders;\n```\nCela multiplie `quantity` par `unit_price` pour chaque commande, puis arrondit le résultat."
          }
        },
        "math-in-sql": {
          "sketch-1": {
            "title": "Utiliser l'arithmétique dans SQL SELECT",
            "bodyMarkdown": "SQL vous permet d'effectuer des opérations arithmétiques directement dans vos instructions SELECT. Par exemple, vous pouvez multiplier des colonnes pour calculer des totaux. Dans la table `orders`, pour obtenir la valeur totale de chaque commande, vous pouvez multiplier `quantity` par `unit_price` :\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nCela crée une nouvelle colonne appelée `line_total` dans le résultat."
          },
          "sketch-2": {
            "title": "Renommer les colonnes calculées avec des alias",
            "bodyMarkdown": "Lorsque vous créez de nouvelles valeurs dans des requêtes SQL, vous pouvez utiliser le mot-clé `AS` pour leur donner un nom clair (alias). Cela rend vos résultats plus lisibles. Par exemple :\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\n\nIci, `total_amount` est un alias pour la valeur calculée."
          },
          "sketch-3": {
            "title": "Expressions et valeurs NULL",
            "bodyMarkdown": "Si une valeur dans une expression arithmétique est `NULL`, le résultat sera aussi `NULL`. Par exemple, si `quantity` est `NULL` pour une ligne, `quantity * unit_price` retournera `NULL` pour cette ligne. Vérifiez toujours vos données pour les valeurs manquantes si vous voyez des `NULL` inattendus dans vos résultats."
          }
        },
        "multiplying-and-dividing": {
          "sk1": {
            "title": "Multiplier des colonnes en SQL",
            "bodyMarkdown": "En SQL, vous pouvez multiplier deux colonnes ensemble pour créer une nouvelle valeur calculée dans votre instruction SELECT. Par exemple, pour calculer la valeur totale de chaque commande dans la table `orders`, vous pouvez multiplier `quantity` par `unit_price` :\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nCette requête ajoute une nouvelle colonne appelée `line_total` qui affiche le résultat de la multiplication pour chaque ligne."
          },
          "sk2": {
            "title": "Diviser des colonnes en SQL",
            "bodyMarkdown": "La division peut aussi être utilisée dans les expressions SQL. Par exemple, si vous voulez connaître le prix moyen par article pour chaque commande, vous pouvez diviser la valeur totale par la quantité :\n\n```sql\nSELECT id, quantity, unit_price, (quantity * unit_price) / quantity AS avg_price\nFROM orders;\n```\n\nCela retournera le prix moyen par article pour chaque commande. Faites attention à ne pas diviser par zéro."
          },
          "sk3": {
            "title": "Utiliser des alias pour la lisibilité",
            "bodyMarkdown": "Lorsque vous utilisez l'arithmétique en SQL, il est utile d'utiliser le mot-clé `AS` pour donner à vos colonnes calculées des noms clairs (alias). Cela rend vos résultats plus faciles à lire et à comprendre. Par exemple :\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\n\nIci, `total_amount` est un alias pour la valeur calculée."
          }
        },
        "number-functions": {
          "sketch-1": {
            "title": "Quelles sont les fonctions numériques en SQL ?",
            "bodyMarkdown": "Les fonctions numériques en SQL sont des fonctions intégrées qui effectuent des opérations sur des données numériques. Elles peuvent être utilisées pour arrondir des nombres, trouver des valeurs minimales ou maximales, calculer des moyennes, et plus encore. Par exemple, vous pouvez utiliser `ROUND()` pour arrondir une valeur, ou `ABS()` pour obtenir la valeur absolue d'un nombre. Ces fonctions sont souvent utilisées dans les instructions SELECT pour transformer ou résumer les données.\n\nExemple :\n\n```sql\nSELECT id, unit_price, ROUND(unit_price) AS rounded_price\nFROM orders;\n```\n\nCette requête sélectionne l'identifiant de la commande, le prix unitaire original et le prix unitaire arrondi pour chaque commande."
          },
          "sketch-2": {
            "title": "Utiliser les opérations arithmétiques et les fonctions numériques ensemble",
            "bodyMarkdown": "Vous pouvez combiner des opérations arithmétiques avec des fonctions numériques pour créer des colonnes calculées plus complexes. Par exemple, vous pourriez vouloir calculer le prix total de chaque commande puis l'arrondir à l'entier le plus proche.\n\nExemple :\n\n```sql\nSELECT id, quantity * unit_price AS total, ROUND(quantity * unit_price) AS rounded_total\nFROM orders;\n```\n\nCette requête multiplie `quantity` par `unit_price` pour obtenir le total, puis utilise `ROUND()` pour arrondir le résultat."
          }
        },
        "renaming-outputs": {
          "sk1": {
            "title": "Pourquoi renommer les sorties ?",
            "bodyMarkdown": "Lorsque vous utilisez des expressions ou des calculs dans une instruction SELECT en SQL, les colonnes résultantes ont souvent des noms génériques ou peu clairs. Renommer ces sorties avec des **alias** à l'aide du mot-clé `AS` rend vos résultats plus faciles à lire et à comprendre. Par exemple :\n\n```sql\nSELECT customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nIci, `quantity * unit_price` reçoit l'alias `line_total`, ce qui rend la colonne de sortie claire et explicite."
          },
          "sk2": {
            "title": "Syntaxe des alias",
            "bodyMarkdown": "Pour renommer une colonne ou une expression en SQL, utilisez le mot-clé `AS` :\n\n```sql\nSELECT column_or_expression AS alias_name\nFROM table_name;\n```\n\nVous pouvez aussi utiliser des alias sans `AS`, mais l'utilisation de `AS` est plus claire et plus lisible. Par exemple :\n\n```sql\nSELECT region AS sales_region FROM orders;\n```"
          },
          "sk3": {
            "title": "Exemple pratique",
            "bodyMarkdown": "Supposons que vous vouliez afficher pour chaque commande le client, le prix total et le statut. Vous pouvez écrire :\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_price, status\nFROM orders;\n```\n\nCette requête calcule le prix total de chaque commande et nomme la colonne `total_price` pour plus de clarté."
          }
        },
        "renaming-result-columns": {
          "sketch-1-alias-basics": {
            "title": "Qu'est-ce qu'un alias de colonne ?",
            "bodyMarkdown": "Un alias de colonne en SQL vous permet de renommer la sortie d'une colonne ou d'une expression dans votre résultat. Ceci est particulièrement utile pour les colonnes calculées ou lorsque vous souhaitez des en-têtes plus descriptifs dans vos rapports.\n\nPar exemple, si vous voulez afficher le prix total pour chaque commande dans la table `orders` :\n\n```sql\nSELECT id, quantity * unit_price AS total_price\nFROM orders;\n```\n\nIci, `total_price` est un alias pour l'expression calculée `quantity * unit_price`."
          },
          "sketch-2-alias-syntax": {
            "title": "Syntaxe et utilisation des alias",
            "bodyMarkdown": "Pour attribuer un alias, utilisez le mot-clé `AS` après la colonne ou l'expression. L'alias apparaît comme en-tête de colonne dans votre résultat.\n\n```sql\nSELECT customer_name AS buyer, region AS sales_region\nFROM orders;\n```\n\nVous pouvez aussi utiliser des alias sans `AS`, mais l'utilisation de `AS` améliore la lisibilité."
          },
          "sketch-3-alias-with-functions": {
            "title": "Alias avec expressions et fonctions",
            "bodyMarkdown": "Les alias sont particulièrement utiles lors de l'utilisation d'expressions ou de fonctions. Par exemple, pour afficher le prix unitaire moyen par commande :\n\n```sql\nSELECT AVG(unit_price) AS avg_price\nFROM orders;\n```\n\nCela rend la colonne de résultat claire et facile à comprendre."
          }
        },
        "simple-report-queries": {
          "sk1": {
            "title": "Qu'est-ce qu'une colonne calculée ?",
            "bodyMarkdown": "Une colonne calculée en SQL est une valeur que vous créez à la volée dans votre instruction SELECT à l'aide d'opérations arithmétiques ou d'expressions. Par exemple, si vous souhaitez voir la valeur totale de chaque commande dans la table `orders`, vous pouvez multiplier `quantity` par `unit_price` :\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\nCette requête affiche l'ID de chaque commande et son total de ligne calculé."
          },
          "sk2": {
            "title": "Utiliser des alias pour plus de clarté",
            "bodyMarkdown": "Les alias vous permettent de renommer les colonnes dans votre résultat pour une meilleure lisibilité. Utilisez le mot-clé `AS` pour donner un nouveau nom à une colonne. Par exemple :\n\n```sql\nSELECT customer_name AS buyer, region, quantity * unit_price AS total_amount\nFROM orders;\n```\nIci, `customer_name` apparaît comme `buyer` et la colonne calculée est nommée `total_amount`."
          },
          "sk3": {
            "title": "Expressions dans SELECT",
            "bodyMarkdown": "Vous pouvez utiliser des expressions arithmétiques directement dans la clause SELECT. Par exemple, pour afficher une remise de 10 % sur chaque commande :\n\n```sql\nSELECT id, unit_price, unit_price * 0.9 AS discounted_price\nFROM orders;\n```\nCette requête affiche les prix originaux et remisés pour chaque commande."
          }
        },
        "string-functions": {
          "sketch-1": {
            "title": "Qu'est-ce qu'une fonction de chaîne en SQL ?",
            "bodyMarkdown": "Les fonctions de chaîne en SQL vous permettent de manipuler les données textuelles dans vos requêtes. Les fonctions de chaîne courantes incluent `UPPER()`, `LOWER()`, `LENGTH()` et `SUBSTR()`. Ces fonctions peuvent vous aider à nettoyer, formater ou extraire des informations à partir de colonnes texte. Par exemple, vous pouvez utiliser `UPPER(customer_name)` pour afficher tous les noms de clients en majuscules."
          },
          "sketch-2": {
            "title": "Utiliser les fonctions de chaîne dans SELECT",
            "bodyMarkdown": "Vous pouvez utiliser les fonctions de chaîne directement dans la clause SELECT pour créer des colonnes calculées. Par exemple, pour afficher la longueur de chaque nom de client dans la table `orders` :\n\n```sql\nSELECT customer_name, LENGTH(customer_name) AS name_length FROM orders;\n```\nCela retournera chaque nom de client ainsi que le nombre de caractères dans son nom."
          },
          "sketch-3": {
            "title": "Combiner fonctions de chaîne et alias",
            "bodyMarkdown": "Les fonctions de chaîne sont souvent combinées avec des alias pour rendre les résultats plus lisibles. Par exemple, pour afficher les trois premières lettres de chaque région en majuscules :\n\n```sql\nSELECT region, UPPER(SUBSTR(region, 1, 3)) AS region_code FROM orders;\n```\nCette requête crée une nouvelle colonne `region_code` affichant les trois premières lettres de la région en majuscules."
          }
        },
        "total-price-calculations": {
          "sketch-1": {
            "title": "Qu'est-ce qu'une colonne calculée ?",
            "bodyMarkdown": "Une colonne calculée en SQL est une valeur que vous créez à la volée dans votre instruction SELECT, souvent en combinant ou en transformant des colonnes existantes. Par exemple, si vous souhaitez connaître le prix total de chaque commande dans la table `orders`, vous pouvez multiplier `quantity` par `unit_price` :\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS total_price\nFROM orders;\n```\n\nIci, `quantity * unit_price` est une expression, et `AS total_price` lui donne un nom clair dans le résultat."
          },
          "sketch-2": {
            "title": "Pourquoi utiliser des alias ?",
            "bodyMarkdown": "Les alias rendent les résultats de vos requêtes plus faciles à lire et à comprendre. Lorsque vous utilisez une expression en SQL, le nom de colonne par défaut peut être déroutant (comme `quantity * unit_price`). En ajoutant `AS total_price`, vous donnez à la colonne un nom significatif :\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_price\nFROM orders;\n```\n\nC'est particulièrement utile lorsque vous partagez des résultats ou créez des rapports."
          },
          "sketch-3": {
            "title": "Gérer les NULL dans les expressions",
            "bodyMarkdown": "Si une valeur dans une expression arithmétique est NULL, le résultat sera également NULL. Par exemple, si `unit_price` est NULL pour une ligne, alors `quantity * unit_price` renverra NULL pour cette ligne. Vérifiez toujours vos données et pensez à utiliser des fonctions comme `COALESCE()` pour gérer les valeurs manquantes si besoin."
          }
        },
        "what-aliases-are": {
          "sk1": {
            "title": "Introduction aux alias en SQL",
            "bodyMarkdown": "En SQL, un **alias** est un nom temporaire donné à une colonne ou une table pour la durée d'une requête. Les alias rendent vos résultats plus lisibles et vos requêtes plus faciles à écrire, surtout lorsque vous utilisez des colonnes calculées ou des expressions. Vous créez un alias avec le mot-clé `AS`.\n\nPar exemple, si vous souhaitez afficher la valeur totale de chaque commande dans la table `orders`, vous pouvez multiplier `quantity` par `unit_price` et donner au résultat un nom explicite :\n\n```sql\nSELECT id, customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nIci, `line_total` est un alias pour la colonne calculée."
          },
          "sk2": {
            "title": "Pourquoi utiliser des alias ?",
            "bodyMarkdown": "Les alias aident à rendre les résultats de vos requêtes SQL plus compréhensibles. Sans alias, les colonnes calculées ou les expressions apparaîtraient avec des noms génériques ou déroutants. Par exemple, `quantity * unit_price` s'afficherait comme une colonne portant exactement ce nom, ce qui n'est pas très convivial.\n\nEn utilisant un alias, vous pouvez renommer cette colonne avec un nom significatif, comme `line_total` ou `total_price`, rendant ainsi vos rapports plus clairs pour toute personne qui les lit."
          }
        },
        "what-expressions-are": {
          "sketch-1": {
            "title": "Qu'est-ce qu'une expression en SQL ?",
            "bodyMarkdown": "Une **expression** en SQL est toute combinaison de valeurs, de colonnes, d'opérateurs et de fonctions qui produit une valeur unique. Les expressions sont souvent utilisées dans la clause `SELECT` pour calculer de nouvelles colonnes ou transformer des données. Par exemple, vous pouvez multiplier deux colonnes pour obtenir une nouvelle valeur :\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\n\nIci, `quantity * unit_price` est une expression qui calcule le prix total pour chaque ligne de commande."
          },
          "sketch-2": {
            "title": "Expressions avec fonctions et alias",
            "bodyMarkdown": "Les expressions peuvent aussi utiliser les fonctions intégrées de SQL. Par exemple, vous pouvez arrondir une valeur calculée :\n\n```sql\nSELECT id, ROUND(quantity * unit_price, 2) AS rounded_total\nFROM orders;\n```\n\nLa fonction `ROUND()` est appliquée à l'expression, et le résultat reçoit l'alias `rounded_total` pour plus de clarté."
          }
        },
        "writing-readable-output": {
          "sk1": {
            "title": "Pourquoi la lisibilité de la sortie est importante",
            "bodyMarkdown": "Lorsque vous écrivez des requêtes SQL, les noms de colonnes par défaut dans vos résultats proviennent souvent directement de la table ou de vos expressions. Ces noms peuvent être peu clairs, surtout lorsque vous utilisez des calculs ou des fonctions. Utiliser des **alias de colonnes** permet de rendre votre sortie plus compréhensible pour toute personne lisant vos rapports."
          },
          "sk2": {
            "title": "Utiliser des alias de colonnes dans SELECT",
            "bodyMarkdown": "Vous pouvez renommer les colonnes dans votre ensemble de résultats en utilisant le mot-clé `AS`. Par exemple, pour afficher la valeur totale de chaque commande dans la table `orders` :\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\n\nIci, `line_total` est un alias pour la colonne calculée."
          },
          "sk3": {
            "title": "Préparer les rapports pour la présentation",
            "bodyMarkdown": "Des noms de colonnes lisibles sont particulièrement importants lorsque vous partagez des résultats avec d’autres personnes. Par exemple, vous pouvez utiliser des espaces dans les alias en les entourant de guillemets doubles :\n\n```sql\nSELECT customer_name AS \"Customer Name\", region AS \"Region\"\nFROM orders;\n```\n\nCela donne à votre sortie l’apparence d’un rapport finalisé."
          }
        }
      }
    }
  },
  "subjects": {
    "linux-terminal-fundamentals": {
      "title": "Les bases du terminal Linux",
      "description": "Un cours sur Linux adapté aux débutants, axé sur la navigation dans le terminal, les fichiers, les dossiers, les bonnes pratiques en matière de commandes et des exercices pratiques dans un environnement de travail.",
      "moreComingSoon": "D'autres leçons sur les bases du terminal Linux seront bientôt disponibles."
    },
    "sql": {
      "title": "SQL pour débutants",
      "description": "Apprenez SQL à partir de zéro avec des exercices pratiques.",
      "moreComingSoon": "D'autres leçons SQL pour débutants arrivent bientôt."
    }
  },
  "modules": {
    "linux-terminal-fundamentals": {
      "linux-module-1-terminal-navigation": {
        "title": "Notions de base sur la navigation dans le terminal",
        "description": "Découvrez ce qu'est le terminal, comment savoir où vous vous trouvez, comment afficher la liste des fichiers et comment naviguer entre les dossiers.",
        "outcomes": [
          "Expliquez à quoi sert une commande de terminal.",
          "Utilisez les commandes « pwd » et « ls » pour vérifier l'emplacement actuel.",
          "Utilisez les commandes « cd », « . », « .. » et « ~ » pour naviguer en toute sécurité.",
          "Créer une arborescence de dossiers simple à l'aide de commandes du terminal."
        ],
        "why": [
          "Permet d'acquérir les bases de la navigation dans un terminal, ce qui renforce la confiance de l'utilisateur.",
          "Prépare les apprenants aux prochaines compétences abordées dans le cours."
        ]
      },
      "linux-module-2-files-and-folders": {
        "title": "Fichiers, dossiers et affichage du contenu",
        "description": "Créer, copier, déplacer, renommer, supprimer et consulter des fichiers depuis le terminal.",
        "outcomes": [
          "Créez des dossiers et des fichiers à l'aide des commandes mkdir, mkdir -p et touch.",
          "Copier, déplacer et renommer des fichiers à l'aide des commandes cp et mv.",
          "Adoptez de bonnes pratiques de suppression avec la commande « rm ».",
          "Examinez les fichiers texte à l'aide des commandes `cat`, `head`, `tail` et `wc`."
        ],
        "why": [
          "Permet de se familiariser avec les fichiers, les dossiers et la consultation de contenus.",
          "Prépare les apprenants aux prochaines compétences abordées dans le cours."
        ]
      },
      "linux-module-3-final-capstone": {
        "title": "Projet de fin d'études : transfert des dossiers",
        "description": "Utilisez le terminal pour mettre de l'ordre dans un petit espace de travail réel et le laisser prêt à être utilisé par quelqu'un d'autre.",
        "outcomes": [
          "Vérifiez un espace de travail avant de le modifier.",
          "Créez une structure de dossiers claire pour une tâche concrète.",
          "Déplacez, copiez, renommez et supprimez des fichiers en toute sécurité.",
          "Vérifiez le fonctionnement de l'espace de travail une fois celui-ci configuré à l'aide de commandes du terminal."
        ],
        "why": [
          "Renforce la confiance grâce à un projet de fin d'études : la passation des archives.",
          "Prépare les apprenants aux prochaines compétences abordées dans le cours."
        ]
      }
    },
    "sql": {
      "sql_module_5": {
        "title": "Colonnes calculées et expressions SQL",
        "description": "Apprenez à créer de nouvelles valeurs à partir de données existantes pour transformer des tables brutes en rapports utiles.",
        "outcomes": [
          "Utiliser des opérations arithmétiques et des expressions dans SELECT.",
          "Renommer les résultats avec des alias pour plus de lisibilité.",
          "Appliquer des fonctions intégrées simples en toute sécurité."
        ],
        "why": [
          "Renforce la confiance avec les colonnes calculées et les expressions SQL.",
          "Prépare les apprenants aux compétences suivantes du cours."
        ]
      }
    }
  },
  "sections": {
    "linux-terminal-fundamentals": {
      "linux-module-1-terminal-navigation": {
        "linux-terminal-fundamentals-linux-module-1-orientation": {
          "title": "Orientation du terminal",
          "description": "Découvrez ce qu'est le terminal, où je me trouve, les commandes « pwd » et « ls », ainsi que la navigation à l'aide de « cd », grâce à des exemples ciblés et des exercices pratiques.",
          "weeks": null,
          "bullets": [
            "Qu'est-ce que le Terminal ?",
            "« Où suis-je ? » pwd et ls",
            "Se déplacer avec le CD"
          ]
        },
        "linux-terminal-fundamentals-linux-module-1-project": {
          "title": "Projet de module",
          "description": "Apprenez à utiliser Project : Terminal Map grâce à des exemples ciblés et des exercices pratiques.",
          "weeks": null,
          "bullets": [
            "Projet : Plan du terminal"
          ]
        }
      },
      "linux-module-2-files-and-folders": {
        "linux-terminal-fundamentals-linux-module-2-file-workflow": {
          "title": "Flux de travail des fichiers",
          "description": "Apprenez à créer des dossiers et des fichiers, à copier, déplacer et renommer des fichiers, ainsi qu'à consulter le contenu des fichiers grâce à des exemples ciblés et à des exercices pratiques.",
          "weeks": null,
          "bullets": [
            "Création de dossiers et de fichiers",
            "Copier, déplacer et renommer",
            "Affichage du contenu d'un fichier"
          ]
        },
        "linux-terminal-fundamentals-linux-module-2-project": {
          "title": "Projet de module",
          "description": "Apprendre le projet : gestionnaire de notes grâce à des exemples ciblés et à des exercices pratiques.",
          "weeks": null,
          "bullets": [
            "Projet : Organisateur de notes"
          ]
        }
      },
      "linux-module-3-final-capstone": {
        "linux-terminal-fundamentals-linux-module-3-capstone": {
          "title": "Projet de fin d'études",
          "description": "Maîtrisez le projet de fin d'études : le transfert des dossiers grâce à des exemples ciblés et à des exercices pratiques.",
          "weeks": null,
          "bullets": [
            "Projet de fin d'études : Transfert des dossiers"
          ]
        }
      }
    },
    "sql": {
      "sql_module_5": {
        "section_5_1": {
          "title": "Créer de nouvelles valeurs dans les requêtes",
          "description": "",
          "weeks": null,
          "bullets": [
            "Ce que sont les expressions",
            "Les mathématiques en SQL",
            "Additionner et soustraire",
            "Multiplier et diviser"
          ]
        },
        "section_5_2": {
          "title": "Alias de colonnes",
          "description": "",
          "weeks": null,
          "bullets": [
            "Ce que sont les alias",
            "AS",
            "Renommer les colonnes de résultats",
            "Écrire des résultats lisibles"
          ]
        },
        "section_5_3": {
          "title": "Fonctions simples",
          "description": "",
          "weeks": null,
          "bullets": [
            "Introduction aux fonctions",
            "Fonctions sur les chaînes de caractères",
            "Fonctions numériques",
            "Sensibilisation aux fonctions de date"
          ]
        },
        "section_5_4": {
          "title": "Pratique des expressions",
          "description": "",
          "weeks": null,
          "bullets": [
            "Calculs de prix total",
            "Calculs de remise",
            "Renommer les résultats",
            "Requêtes de rapports simples"
          ]
        }
      }
    }
  },
  "quiz": {
    "m0_comments_symbol": {
      "title": "Symbole de commentaire (#)",
      "prompt": "Quel symbole démarre un commentaire sur une seule ligne en Python ?",
      "options": {
        "a": "`//`",
        "b": "`#`",
        "c": "`/* ... */`"
      },
      "hint": "Python utilise `#` pour les commentaires sur une ligne."
    },
    "m0_comments_ignored_by_python": {
      "title": "Python ignore les commentaires",
      "prompt": "Les commentaires servent surtout à :",
      "options": {
        "a": "Aider les humains à lire le code",
        "b": "Faire tourner Python plus vite",
        "c": "Changer automatiquement la sortie"
      },
      "hint": "Python ignore les commentaires ; ils aident les humains à comprendre le code."
    },
    "m0_comments_best_reason": {
      "title": "Meilleure raison de commenter",
      "prompt": "Quelle est la meilleure raison d’écrire un commentaire ?",
      "options": {
        "a": "Répéter exactement ce que le code dit déjà",
        "b": "Expliquer l’intention ou une étape délicate",
        "c": "Rendre le fichier plus long"
      },
      "hint": "Un bon commentaire explique l’intention (le pourquoi), pas l’évidence (le quoi)."
    },
    "m0_comments_multiline_true": {
      "title": "Commentaires multi-lignes",
      "prompt": "Quelle est la méthode recommandée pour écrire des notes multi-lignes en Python ?",
      "options": {
        "a": "Utiliser `/* ... */`",
        "b": "Utiliser plusieurs lignes qui commencent par `#`",
        "c": "Utiliser `//` sur chaque ligne"
      },
      "hint": "Python n’utilise pas `/* */` ni `//`. Pour des notes multi-lignes, utilise plusieurs lignes `#`."
    },
    "m0_comments_docstring_vs_comment": {
      "title": "Docstring vs commentaire",
      "prompt": "Quelle affirmation est vraie à propos des docstrings (triple guillemets) vs les commentaires ?",
      "options": {
        "a": "Les docstrings sont ignorées exactement comme les commentaires `#`",
        "b": "Les docstrings ne fonctionnent qu’en haut d’un fichier, jamais ailleurs",
        "c": "Les docstrings sont des chaînes utilisées pour la documentation ; `#` est le vrai symbole de commentaire",
        "d": "Python ne supporte pas les docstrings"
      },
      "hint": "Les docstrings sont des chaînes pour la documentation (ex. doc d’une fonction). `#` est la syntaxe de commentaire."
    },
    "m0_comments_inline_comment": {
      "title": "Commentaires en fin de ligne",
      "prompt": "Quelle ligne utilise correctement un commentaire en fin de ligne en Python ?",
      "options": {
        "a": "`total = price * qty  # calculer le total`",
        "b": "`total = price * qty  // calculer le total`",
        "c": "`total = price * qty  /* calculer le total */`",
        "d": "`total = price * qty  -- calculer le total`"
      },
      "hint": "Un commentaire en fin de ligne utilise `#` après le code : `value = ...  # explication`."
    },
    "m0_comments_multiline_valid_ways": {
      "title": "Façons valides d’écrire des notes multi-lignes",
      "prompt": "Quelles sont des façons valides d’écrire des notes/commentaires multi-lignes en Python ? (Choisis tout ce qui s’applique.)",
      "options": {
        "a": "Plusieurs lignes commençant par `#`",
        "b": "Une chaîne multi-ligne avec triple guillemets utilisée comme note",
        "c": "Des blocs `/* ... */`",
        "d": "`//` au début de chaque ligne"
      },
      "hint": "Les vrais commentaires Python sont des lignes `#`. Les triples guillemets peuvent servir de docstrings/notes, mais `/* */` et `//` ne sont pas du Python."
    },
    "m0_comments_which_lines_are_comments": {
      "title": "Trouver les lignes de commentaire",
      "prompt": "Regarde les lignes ci-dessous. Quelles lignes sont des commentaires ? (Choisis tout ce qui s’applique.)\n\n1) `# Hello`\n2) `print(\"Hi\")`\n3) `x = 3  # set x`\n4) `#x = 10`\n",
      "options": {
        "a": "Ligne 1",
        "b": "Ligne 2",
        "c": "Ligne 3",
        "d": "Ligne 4"
      },
      "hint": "Une ligne de commentaire commence par `#`. Du code peut aussi avoir un commentaire en fin de ligne."
    },
    "m0_comments_disable_error_line": {
      "title": "Corriger en commentant une ligne",
      "prompt": "Le programme plante à cause d’une mauvaise ligne.\n\nTa tâche :\n- Commente la ligne qui provoque l’erreur\n- Garde les autres lignes\n- La sortie doit être :\n  - `Start`\n  - `End`\n",
      "hint": "Mets `#` au début de la ligne qui échoue (ou supprime la ligne)."
    },
    "m0_comments_disable_wrong_math_line": {
      "title": "Désactiver la mauvaise ligne de calcul",
      "prompt": "Le programme calcule un total correctement, puis une ligne en trop le casse.\n\nTa tâche :\n- Commente UNIQUEMENT la ligne incorrecte\n- Le programme doit afficher `12`\n",
      "hint": "La ligne `total = total + 100` est le bug — commente-la."
    },
    "m1_types_string_vs_int_sc": {
      "title": "Quotes change the type",
      "prompt": "Which value is a string (`str`) in Python?",
      "options": {
        "a": "`42`",
        "b": "`\"42\"`",
        "c": "`3.14`"
      },
      "hint": "Quotes make it text (a string)."
    },
    "m1_types_int_vs_float_sc": {
      "title": "int vs float",
      "prompt": "Which value is a float (`float`)?",
      "options": {
        "a": "`7`",
        "b": "`7.0`",
        "c": "`\"7.0\"`"
      },
      "hint": "Decimals are floats (unless they’re quoted)."
    },
    "m1_types_bool_sc": {
      "title": "Booleans are True/False",
      "prompt": "Which value is a boolean (`bool`)?",
      "options": {
        "a": "`True`",
        "b": "`\"True\"`",
        "c": "`1.0`"
      },
      "hint": "Booleans are the keywords True or False (without quotes)."
    },
    "m1_types_none_sc": {
      "title": "None means “no value yet”",
      "prompt": "Which value represents “no value yet” in Python?",
      "options": {
        "a": "`0`",
        "b": "`\"\"` (empty string)",
        "c": "`None`"
      },
      "hint": "None is its own special value."
    },
    "m1_types_convert_next_year_code": {
      "title": "Convert age to int and compute next year",
      "prompt": "A signup form collects:\n1) name\n2) age\n\nRead TWO inputs:\n- name (text)\n- age (text, but it represents a number)\n\nConvert age to an integer, then print EXACTLY:\nHi <name>! Next year you'll be <age+1>.",
      "hint": "age = int(age)",
      "outputTemplate": "Hi {name}! Next year you'll be {age_next}."
    },
    "m1_types_tip_total_code": {
      "title": "Restaurant tip + total (ints)",
      "prompt": "A restaurant app asks for:\n1) bill (integer)\n2) tip percent (integer)\n\nCompute:\ntip = bill * pct // 100\ntotal = bill + tip\n\nPrint EXACTLY:\nTip = <tip>\nTotal = <total>",
      "hint": "Use integer math: // 100",
      "tipLineTemplate": "Tip = {tip}",
      "totalLineTemplate": "Total = {total}"
    },
    "m1_types_c_to_f_code": {
      "title": "Celsius → Fahrenheit",
      "prompt": "A weather station gives Celsius as an integer C.\n\nRead ONE integer C.\nCompute:\nF = C * 9/5 + 32\n\nPrint ONLY F.",
      "hint": "f = int(c * 9 / 5 + 32)"
    },
    "m1_types_errors_sc": {
      "title": "Match the error to the problem",
      "prompt": "A student runs this code:\n\n~~~python\nage = input(\"Age: \")\nprint(age + 1)\n~~~\n\nWhat error will Python raise?",
      "options": {
        "a": "NameError",
        "b": "TypeError",
        "c": "ValueError"
      },
      "hint": "input() returns a string, and you can’t add a string and an int."
    },
    "m1_err_nameerror_sc": {
      "title": "NameError: label doesn’t exist",
      "prompt": "What error do you get if you run this?\n\n~~~python\nprint(score)\n~~~\n\n(Assume `score` was never created.)",
      "options": {
        "a": "NameError",
        "b": "TypeError",
        "c": "ValueError"
      },
      "hint": "NameError happens when you use a variable name that doesn’t exist yet."
    },
    "m1_err_typeerror_sc": {
      "title": "TypeError: types don’t mix",
      "prompt": "A shopping app stores the item count as a number:\n\n~~~python\ncount = 3\nprint(\"Items: \" + count)\n~~~\n\nWhat error will this cause?",
      "options": {
        "a": "NameError",
        "b": "TypeError",
        "c": "ValueError"
      },
      "hint": "You can’t concatenate a string and an int. Convert with str(count)."
    },
    "m1_err_valueerror_sc": {
      "title": "ValueError: invalid conversion",
      "prompt": "A user typed `twelve` for their age.\n\nWhat happens here?\n\n~~~python\nage = int(\"twelve\")\n~~~",
      "options": {
        "a": "NameError",
        "b": "TypeError",
        "c": "ValueError"
      },
      "hint": "ValueError happens when conversion fails because the text isn’t a valid number."
    },
    "m1_err_debug_combo_sc": {
      "title": "Best quick debug combo",
      "prompt": "When something behaves weirdly, what’s the best quick debug combo for beginners?",
      "options": {
        "a": "Print the value and print the type",
        "b": "Restart the computer",
        "c": "Delete the file and rewrite everything"
      },
      "hint": "Value + type solves most beginner confusion fast."
    },
    "m1_err_fix_type_mismatch_code": {
      "title": "Fix the type mismatch (add two numbers)",
      "prompt": "A calculator app reads two numbers from the user.\n\nRead TWO inputs.\nConvert them to integers.\nPrint ONLY their sum.\n",
      "hint": "int(a) and int(b)",
      "starterCode": "a = input()\nb = input()\n# TODO: convert and print sum\n"
    },
    "m1_err_parse_age_safely_code": {
      "title": "Avoid ValueError (basic validation)",
      "prompt": "A website asks for age as text.\n\nRead ONE input (a string).\n\nRules:\n- If it looks like a whole number (digits only), convert it to int and print:\n  Next year = <age+1>\n- Otherwise print:\n  Invalid age",
      "hint": "Use text.isdigit() to check. Then int(text).",
      "starterCode": "text = input().strip()\n# TODO\n",
      "runtime": {
        "nextYearTemplate": "Next year = {age_next}",
        "invalidAgeText": "Invalid age"
      }
    },
    "m1_io_age_next_year": {
      "title": "Âge l’année prochaine",
      "prompt": "Lis DEUX entrées :\n1) nom\n2) âge\n\nAffiche exactement :\nBonjour <name> ! L’année prochaine, tu auras <age+1> ans.",
      "hint": "Convertis l’âge avec `int(...)`.",
      "starterCode": "# TODO\n",
      "runtime": {
        "outputTemplate": "Bonjour {name} ! L’année prochaine, tu auras {age_next} ans."
      }
    },
    "m1_io_tip_total": {
      "title": "Pourboire + total",
      "prompt": "Lis DEUX entiers :\n1) addition\n2) pourcentage du pourboire\n\nCalcule :\ntip = bill * pct // 100\ntotal = bill + tip\n\nAffiche exactement :\nPourboire = <tip>\nTotal = <total>",
      "hint": "Utilise les maths entières : `// 100`.",
      "starterCode": "bill = int(input())\npct = int(input())\n# TODO\n",
      "runtime": {
        "tipLineTemplate": "Pourboire = {tip}",
        "totalLineTemplate": "Total = {total}"
      }
    },
    "m1_io_c_to_f": {
      "title": "Celsius → Fahrenheit",
      "prompt": "Lis UN entier C.\n\nCalcule :\nF = C * 9/5 + 32\n\nAffiche UNIQUEMENT F.",
      "hint": "f = int(c * 9 / 5 + 32)",
      "starterCode": "c = int(input())\n# TODO\n"
    },
    "m1_io_input_returns_str": {
      "title": "Que renvoie `input()` ?",
      "prompt": "Regarde ce code :\n\n~~~python\nx = input()\n~~~\n\nSi l’utilisateur tape `42`, quel est le type de `x` ?",
      "hint": "`input()` renvoie toujours du texte.",
      "options": {
        "a": "int",
        "b": "float",
        "c": "str",
        "d": "bool"
      }
    },
    "m1_io_tip_integer_math": {
      "title": "Maths entières pour le pourboire",
      "prompt": "Quelle ligne calcule correctement le pourboire avec des maths entières ?",
      "hint": "Utilise `//` pour la division entière.",
      "options": {
        "a": "tip = bill * pct / 100",
        "b": "tip = bill * pct // 100",
        "c": "tip = bill + pct // 100",
        "d": "tip = pct - bill"
      }
    },
    "m1_io_c_to_f_formula": {
      "title": "Formule de température",
      "prompt": "Quelle expression correspond au calcul Celsius → Fahrenheit de la leçon pour un entier `c` ?",
      "hint": "Multiplie par 9, divise par 5, puis ajoute 32.",
      "options": {
        "a": "int(c * 9 / 5 + 32)",
        "b": "int(c + 32 * 9 / 5)",
        "c": "int(c * 5 / 9 + 32)",
        "d": "int(c * 9 / (5 + 32))"
      }
    },
    "m1_io_age_next_year_parts": {
      "title": "Construire la solution « âge l’année prochaine »",
      "prompt": "Sélectionne toutes les lignes qui appartiennent à une solution correcte pour le programme **Âge l’année prochaine**.",
      "hint": "Tu as besoin d’une entrée, d’une conversion et d’un format de sortie exact.",
      "options": {
        "a": "name = input()",
        "b": "age = int(input())",
        "c": "print(f\"Bonjour {name} ! L’année prochaine, tu auras {age + 1} ans.\")",
        "d": "age = input() + 1",
        "e": "print(name, age, 1)"
      }
    },
    "m1_io_tip_output_lines": {
      "title": "Lignes de sortie exactes",
      "prompt": "Après avoir calculé `tip` et `total`, sélectionne toutes les lignes qui correspondent exactement à la sortie demandée.",
      "hint": "Les libellés doivent correspondre exactement : `Pourboire =` et `Total =`.",
      "options": {
        "a": "print(f\"Pourboire = {tip}\")",
        "b": "print(f\"Total = {total}\")",
        "c": "print(f\"Pourboire : {tip}\")",
        "d": "print(f\"total = {total}\")"
      }
    },
    "m1_io_convert_then_compute_truths": {
      "title": "Convertir, puis calculer",
      "prompt": "Sélectionne toutes les affirmations vraies à propos du programme de conversion de température.",
      "hint": "Pense au schéma : Demander → Convertir → Calculer → Afficher.",
      "options": {
        "a": "`input()` donne une chaîne de caractères.",
        "b": "`int(input())` peut convertir un texte entier valide en entier.",
        "c": "`print()` ne peut pas afficher de variables.",
        "d": "`c * 9 / 5 + 32` est l’étape de calcul.",
        "e": "Tu dois garder `c` comme texte brut si tu veux faire des maths avec."
      }
    },
    "m1_ops_precedence_rule_sc": {
      "title": "Precedence rule",
      "prompt": "Which rule is correct for the expression `a + b * c`?",
      "hint": "Multiplication happens before addition unless parentheses change the order.",
      "options": {
        "a": "Addition always happens before multiplication.",
        "b": "Multiplication happens before addition.",
        "c": "Python always evaluates left to right with no precedence."
      }
    },
    "m1_ops_mod_result_sc": {
      "title": "What modulo means",
      "prompt": "What does `n % 2` tell you?",
      "hint": "Modulo gives the remainder after division.",
      "options": {
        "a": "It doubles the number.",
        "b": "It removes decimals.",
        "c": "It gives the remainder when dividing by 2."
      }
    },
    "m1_ops_checkout_formula_sc": {
      "title": "Checkout formula",
      "prompt": "Which code correctly computes tax using integer math?",
      "hint": "Use `// 100` to keep the result as whole-number integer math.",
      "options": {
        "a": "tax = subtotal * taxPct // 100",
        "b": "tax = subtotal + taxPct // 100",
        "c": "tax = subtotal // taxPct * 100"
      },
      "m1_ops_precedence_parts_mc": {
        "title": "Parts of operator precedence",
        "prompt": "Select all true statements about `a + b * c`.",
        "hint": "Think about which part is computed first.",
        "options": {
          "a": "`b * c` is evaluated first.",
          "b": "`a + b` is always evaluated first.",
          "c": "The result is `a + (b * c)`.",
          "d": "Multiplication and addition always mean the same thing."
        }
      },
      "m1_ops_evenodd_truths_mc": {
        "title": "Even and odd with modulo",
        "prompt": "Select all true statements.",
        "hint": "Check what happens when dividing by 2.",
        "options": {
          "a": "If `n % 2 == 0`, then `n` is even.",
          "b": "If `n % 2 == 0`, then `n` is odd.",
          "c": "Modulo means string concatenation.",
          "d": "If `n % 2 != 0`, then `n` is odd."
        }
      },
      "m1_ops_checkout_outputs_mc": {
        "title": "Exact checkout output",
        "prompt": "Select all lines that match the required output exactly.",
        "hint": "The labels and capitalization must match exactly.",
        "options": {
          "a": "print(f\"Tax = {tax}\")",
          "b": "print(f\"Total = {total}\")",
          "c": "print(f\"tax = {tax}\")",
          "d": "print(f\"Total: {total}\")"
        }
      },
      "m1_ops_precedence_sc": {
        "title": "Operator precedence",
        "prompt": "Read THREE integers (a, b, c).\n\nCompute and print:\na + b * c\n\nPrint ONLY the number (one line).",
        "hint": "Multiplication happens before addition: a + (b * c).",
        "starterCode": "a = int(input())\nb = int(input())\nc = int(input())\n# TODO: print a + b * c\n"
      },
      "m1_ops_mod_evenodd_sc": {
        "title": "Modulo even/odd",
        "prompt": "Read ONE integer n.\n\nIf n is even, print:\neven\n\nOtherwise print:\nodd",
        "hint": "If n % 2 == 0, it's even.",
        "starterCode": "n = int(input())\n# TODO: print \"even\" or \"odd\"\n",
        "runtime": {
          "evenText": "even",
          "oddText": "odd"
        }
      },
      "m1_ops_checkout_code": {
        "title": "Checkout (subtotal + tax)",
        "prompt": "Read TWO integers:\n1) subtotal\n2) tax percent\n\nCompute:\n- tax = subtotal * taxPct // 100\n- total = subtotal + tax\n\nPrint EXACTLY two lines:\nTax = <tax>\nTotal = <total>",
        "hint": "tax = subtotal * taxPct // 100",
        "starterCode": "subtotal = int(input())\ntaxPct = int(input())\n# TODO\n",
        "runtime": {
          "taxLineTemplate": "Tax = {tax}",
          "totalLineTemplate": "Total = {total}"
        }
      }
    },
    "m1_str_concat_vs_comma_sc": {
      "title": "Concatenation vs commas",
      "prompt": "Assume `age = 16`. Which line prints **without** an error?",
      "options": {
        "a": "`print(\"age: \" + age)`",
        "b": "`print(\"age:\", age)`",
        "c": "`print(\"age: \" + 16)`"
      },
      "hint": "Commas work with numbers. Using + requires strings on both sides."
    },
    "m1_str_fstring_greeting_code": {
      "title": "f-string greeting",
      "prompt": "Read ONE input (name).\n\nPrint EXACTLY:\nHello, <name>!",
      "hint": "print(f\"Hello, {name}!\")",
      "starterCode": "# TODO\n"
    },
    "m1_str_username_code": {
      "title": "Username generator",
      "prompt": "Read TWO inputs (first, last).\n\nRules:\n- strip spaces\n- username = first letter of first + last\n- lowercase\nPrint ONLY the username.",
      "hint": "username = (first.strip()[0] + last.strip()).lower()",
      "starterCode": "# TODO\n"
    },
    "m1_str_fstring_placeholder_sc": {
      "title": "f-string placeholder",
      "prompt": "Which line correctly inserts the variable `name` into an f-string?",
      "hint": "Inside an f-string, put the variable name inside curly braces.",
      "options": {
        "a": "print(f\"Hello, name!\")",
        "b": "print(f\"Hello, {name}!\")",
        "c": "print(\"Hello, {name}!\")"
      }
    },
    "m1_str_strip_sc": {
      "title": "What strip() does",
      "prompt": "What does `.strip()` do to a string?",
      "hint": "It removes extra spaces from the beginning and end.",
      "options": {
        "a": "It removes spaces from the beginning and end.",
        "b": "It turns all letters lowercase.",
        "c": "It removes every letter from the string."
      }
    },
    "m1_str_lower_sc": {
      "title": "What lower() does",
      "prompt": "What does `.lower()` do to a string?",
      "hint": "It changes uppercase letters into lowercase letters.",
      "options": {
        "a": "It removes spaces.",
        "b": "It keeps only the first letter.",
        "c": "It converts the string to lowercase."
      }
    },
    "m1_str_username_steps_mc": {
      "title": "Username-building steps",
      "prompt": "Select all steps used to build the username correctly.",
      "hint": "The username uses cleaned text, the first letter of the first name, and lowercase output.",
      "options": {
        "a": "Use `.strip()` to remove extra spaces.",
        "b": "Use the full first name.",
        "c": "Take the first character of the first name.",
        "d": "Convert the result to lowercase."
      }
    },
    "m1_str_concat_truths_mc": {
      "title": "String-building truths",
      "prompt": "Select all true statements about strings in this lesson.",
      "hint": "Think about commas, `+`, and f-strings.",
      "options": {
        "a": "Using commas in `print()` can show strings and numbers together.",
        "b": "Using `+` with text works when both sides are strings.",
        "c": "An f-string cannot include variables.",
        "d": "`.lower()` turns a string into a number."
      }
    },
    "m1_str_indexing_first_char_mc": {
      "title": "First character with indexing",
      "prompt": "Select all true statements about `first[0]`.",
      "hint": "`[0]` means the first character in the string.",
      "options": {
        "a": "`first[0]` means the whole string.",
        "b": "`first[0]` gets the first character.",
        "c": "`first[0]` always returns a number.",
        "d": "You can use `first[0]` when building a username."
      }
    },
    "m1_vars_what_is_variable_sc": {
      "title": "What is a variable?",
      "prompt": "What is a variable in Python?",
      "hint": "Think of a variable like a labeled box that stores a value.",
      "options": {
        "a": "A labeled box that stores a value",
        "b": "A type of loop",
        "c": "A Python error message"
      }
    },
    "m1_vars_assignment_operator_sc": {
      "title": "The assignment operator",
      "prompt": "Which symbol is used to assign a value to a variable?",
      "hint": "Assignment in Python uses a single equals sign.",
      "options": {
        "a": "==",
        "b": "=",
        "c": "+"
      }
    },
    "m1_vars_valid_name_sc": {
      "title": "Valid variable name",
      "prompt": "Which of these is a valid Python variable name?",
      "hint": "Variable names cannot start with a number.",
      "options": {
        "a": "2name",
        "b": "first-name",
        "c": "first_name"
      }
    },
    "m1_vars_update_value_sc": {
      "title": "Updating a variable",
      "prompt": "If `score = 10` and then `score = 15`, what is the value of `score` now?",
      "hint": "The new assignment replaces the old value.",
      "options": {
        "a": "15",
        "b": "10",
        "c": "25"
      }
    },
    "m1_vars_boxes_print_code": {
      "title": "Boxes: store and print",
      "prompt": "Read TWO inputs:\n1) name\n2) age\n\nStore them in variables and print EXACTLY:\nname = <name>\nage = <age>",
      "hint": "Read each input into a variable, then print the two labeled lines.",
      "starterCode": "# Read inputs\n# TODO\n\n# Print exactly:\n# name = <name>\n# age = <age>\n",
      "runtime": {
        "nameLineTemplate": "name = {name}",
        "ageLineTemplate": "age = {age}"
      }
    },
    "m1_vars_swap_values_code": {
      "title": "Swap two values",
      "prompt": "Read TWO integers a and b.\n\nSwap their values, then print:\n- the new value of a\n- the new value of b\n\nEach on its own line.",
      "hint": "Python can swap values with `a, b = b, a`.",
      "starterCode": "a = int(input())\nb = int(input())\n# TODO: swap a and b\n# TODO: print a then b\n"
    },
    "m1_vars_running_total_code": {
      "title": "Running total",
      "prompt": "Read THREE integers:\nday1\nday2\nday3\n\nStore them in variables, compute the total, and print:\nTotal = <total>",
      "hint": "Add the three variables, store the result in `total`, then print it.",
      "starterCode": "day1 = int(input())\nday2 = int(input())\nday3 = int(input())\n# TODO\n",
      "runtime": {
        "totalLineTemplate": "Total = {total}"
      }
    }
  },
  "common": {
    "terminalInputLabel": "input",
    "terminalOutputLabel": "output"
  }
};
export default messages;
